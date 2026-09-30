import assert from "node:assert/strict";
import sharp from "sharp";
import { generateImageEditorOutput } from "../server/imageEditor";

const referenceImage = await sharp({
  create: { width: 32, height: 32, channels: 3, background: { r: 32, g: 96, b: 160 } },
}).jpeg().toBuffer();
const generatedImage = await sharp({
  create: { width: 64, height: 64, channels: 3, background: { r: 160, g: 96, b: 32 } },
}).jpeg().toBuffer();

const originalFetch = globalThis.fetch;
let referenceRequests = 0;
let generationRequests = 0;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(requestUrl);
  if (url.hostname === "8.8.8.8") {
    referenceRequests++;
    return new Response(referenceImage, {
      status: 200,
      headers: {
        "content-type": "image/jpeg",
        "content-length": String(referenceImage.length),
      },
    });
  }
  if (url.hostname === "api.openai.com") {
    generationRequests++;
    assert.equal(url.pathname, "/v1/images/edits");
    const requestBody = JSON.parse(String(init?.body ?? "{}"));
    assert.match(requestBody.images?.[0]?.image_url ?? "", /^data:image\/jpeg;base64,/);
    assert.equal("logoDataUrl" in requestBody, false);
    return new Response(
      JSON.stringify({ data: [{ b64_json: generatedImage.toString("base64") }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  throw new Error(`Unexpected image editor request to ${url.hostname}.`);
}) as typeof fetch;

try {
  const result = await generateImageEditorOutput({
    apiKey: "mock-only",
    generalDirection: "Create a professional ecommerce product image",
    specificCustomization: "",
    referenceImageUrl: "https://8.8.8.8/reference.jpg",
  });

  assert.deepEqual(result, generatedImage, "return the generated image without a logo composite");
  assert.equal(referenceRequests, 1, "download the URL reference image");
  assert.equal(generationRequests, 1, "send one mocked image-generation request");
  console.log("Image Editor URL-reference verification passed.");
} finally {
  globalThis.fetch = originalFetch;
}