import assert from "node:assert/strict";
import { createServer } from "node:net";
import nodemailer from "nodemailer";
import { ensureHtml } from "../client/src/components/editor/RichTextEditor";
import { sanitizeMarketingEditorHtml } from "../server/marketing";

async function verifyLocalSmtpDelivery(): Promise<void> {
  const deliveredMessages: string[] = [];
  const server = createServer(socket => {
    socket.setEncoding("utf8");
    socket.write("220 local.test ESMTP safe-test-sink\r\n");

    let pending = "";
    let messageLines: string[] = [];
    let receivingData = false;
    let authStage = 0;
    socket.on("data", chunk => {
      pending += chunk;
      let newline = pending.indexOf("\n");
      while (newline >= 0) {
        const line = pending.slice(0, newline).replace(/\r$/, "");
        pending = pending.slice(newline + 1);

        if (receivingData) {
          if (line === ".") {
            receivingData = false;
            deliveredMessages.push(messageLines.join("\n"));
            messageLines = [];
            socket.write("250 2.0.0 accepted by local test sink\r\n");
          } else {
            messageLines.push(line.startsWith("..") ? line.slice(1) : line);
          }
        } else if (authStage === 1) {
          authStage = 2;
          socket.write("334 UGFzc3dvcmQ6\r\n");
        } else if (authStage === 2) {
          authStage = 0;
          socket.write("235 2.7.0 authenticated\r\n");
        } else if (/^EHLO\b|^HELO\b/i.test(line)) {
          socket.write("250-local.test\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE 10485760\r\n");
        } else if (/^AUTH PLAIN\b/i.test(line)) {
          socket.write("235 2.7.0 authenticated\r\n");
        } else if (/^AUTH LOGIN\b/i.test(line)) {
          authStage = 1;
          socket.write("334 VXNlcm5hbWU6\r\n");
        } else if (/^(MAIL FROM|RCPT TO)\b/i.test(line)) {
          socket.write("250 2.1.0 accepted\r\n");
        } else if (/^DATA\b/i.test(line)) {
          receivingData = true;
          socket.write("354 end with <CRLF>.<CRLF>\r\n");
        } else if (/^RSET\b/i.test(line)) {
          socket.write("250 2.0.0 reset\r\n");
        } else if (/^NOOP\b/i.test(line)) {
          socket.write("250 2.0.0 ok\r\n");
        } else if (/^QUIT\b/i.test(line)) {
          socket.write("221 2.0.0 closing connection\r\n");
          socket.end();
        } else {
          socket.write("250 2.0.0 ok\r\n");
        }
        newline = pending.indexOf("\n");
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();
    assert(address && typeof address !== "string", "SMTP sink should bind a local TCP port");
    const transport = nodemailer.createTransport({
      host: "127.0.0.1",
      port: address.port,
      secure: false,
      auth: { user: "safe-test-user", pass: "safe-test-password" },
      disableFileAccess: true,
      disableUrlAccess: true,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
    });

    await transport.verify();
    await transport.sendMail({
      from: "sales@example.test",
      to: "recipient@example.test",
      subject: "Password reset compatibility check",
      text: "Use the local test link to reset your password.",
      html: "<p>Use the local test link to reset your password.</p>",
    });
    await transport.sendMail({
      from: "sales@example.test",
      to: "recipient@example.test",
      subject: "Invoice compatibility check",
      text: "The local test invoice is attached.",
      attachments: [{
        filename: "test-invoice.pdf",
        content: Buffer.from("%PDF-1.4 local test invoice"),
        contentType: "application/pdf",
      }],
    });
    await transport.sendMail({
      from: "sales@example.test",
      to: "recipient@example.test",
      subject: "Campaign compatibility check",
      text: "A local test campaign message.",
      html: "<p>A local test campaign message.</p>",
    });
    transport.close();

    assert.equal(deliveredMessages.length, 3, "all three sample messages should reach only the local sink");
    assert.match(deliveredMessages[0], /Password reset compatibility check/);
    assert.match(deliveredMessages[1], /Invoice compatibility check/);
    assert.match(deliveredMessages[1], /test-invoice\.pdf/);
    assert.match(deliveredMessages[2], /Campaign compatibility check/);
    console.log("Nodemailer 10 local SMTP checks passed for reset, invoice attachment, and campaign-style email.");
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

function verifyMarketingEditorContent(): void {
  assert.equal(ensureHtml("Hello\n\nWorld"), "<p>Hello</p><p>World</p>");
  const richContent = '<p><strong>Hello</strong> <span style="font-size: 18px;">world</span></p>';
  assert.equal(ensureHtml(richContent), richContent);

  const sanitized = sanitizeMarketingEditorHtml(
    '<p onclick="alert(1)">Welcome</p><script>alert(2)</script><a href="javascript:alert(3)">details</a>',
  );
  assert.match(sanitized, /<p>Welcome<\/p>/);
  assert.doesNotMatch(sanitized, /<script|onclick|javascript:/i);
  console.log("Marketing editor content checks passed for HTML preservation and unsafe markup removal.");
}

verifyMarketingEditorContent();
await verifyLocalSmtpDelivery();
