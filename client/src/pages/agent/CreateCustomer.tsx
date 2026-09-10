import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardCopy, Loader2, MapPin, UserPlus } from "lucide-react";
import * as api from "@/lib/api";

type Address = {
  first_name: string;
  last_name: string;
  company: string;
  address1: string;
  address2: string;
  city: string;
  state_or_province: string;
  postal_code: string;
  country_code: string;
  phone: string;
};

interface CreateCustomerPayload {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  company?: string;
  business_tax_id: string;
  address1?: string;
  address2?: string;
  city?: string;
  state_or_province?: string;
  postal_code?: string;
  country_code?: string;
  signed_up_by_user_id: number;
  shipping_address: Address;
  idempotency_key: string;
}

async function createBcCustomer(payload: CreateCustomerPayload) {
  const res = await fetch("/api/bigcommerce/customers/create", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...api.getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create customer");
  return data;
}

function Field({
  label, id, required, type = "text", value, onChange, placeholder, disabled = false,
}: {
  label: string; id: string; required?: boolean; type?: string; value: string;
  onChange: (v: string) => void; placeholder?: string; disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-medium text-slate-700">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        data-testid={`input-${id}`}
        className="h-9 text-sm disabled:bg-slate-100"
      />
    </div>
  );
}

const EMPTY = {
  first_name: "", last_name: "", email: "", phone: "", company: "", business_tax_id: "",
  address1: "", address2: "", city: "", state_or_province: "", postal_code: "", country_code: "US",
};
const EMPTY_ADDRESS: Address = {
  first_name: "", last_name: "", company: "", address1: "", address2: "",
  city: "", state_or_province: "", postal_code: "", country_code: "US", phone: "",
};

export default function CreateCustomer() {
  const { toast } = useToast();
  const { currentUser } = useStore();
  const [form, setForm] = useState(EMPTY);
  const [shipping, setShipping] = useState<Address>(EMPTY_ADDRESS);
  const [copyToAddressBook, setCopyToAddressBook] = useState(true);
  const [signedUpByUserId, setSignedUpByUserId] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID().replace(/-/g, ""));

  const { data: appUsers = [] } = useQuery({
    queryKey: ["users", "summary"],
    queryFn: api.getUsersSummary,
    staleTime: 5 * 60 * 1000,
  });
  const { data: signupConfig } = useQuery({
    queryKey: ["customer-signups", "config"],
    queryFn: api.getCustomerSignupConfig,
    staleTime: 60_000,
  });
  const activeUsers = appUsers.filter((user) => user.is_enabled && (currentUser?.role === "admin" || user.id === currentUser?.id));
  const groupName = signupConfig?.groupName || "Verification Pending";

  useEffect(() => {
    if (!signedUpByUserId && currentUser?.id) setSignedUpByUserId(String(currentUser.id));
  }, [currentUser?.id, signedUpByUserId]);

  const copiedAddress = useMemo<Address>(() => ({
    first_name: form.first_name,
    last_name: form.last_name,
    company: form.company,
    address1: form.address1,
    address2: form.address2,
    city: form.city,
    state_or_province: form.state_or_province,
    postal_code: form.postal_code,
    country_code: form.country_code || "US",
    phone: form.phone,
  }), [form]);
  const effectiveShipping = copyToAddressBook ? copiedAddress : shipping;

  const set = (key: keyof typeof EMPTY) => (val: string) => setForm((prev) => ({ ...prev, [key]: val }));
  const setShippingField = (key: keyof Address) => (val: string) => setShipping((prev) => ({ ...prev, [key]: val }));

  const mutation = useMutation({
    mutationFn: createBcCustomer,
    onSuccess: (created) => {
      toast({
        title: "Customer Created",
        description: `${form.first_name} ${form.last_name} has been added to BigCommerce and placed in the ${created.customer_group_name || groupName} group.`,
      });
      setForm(EMPTY);
      setShipping(EMPTY_ADDRESS);
      setCopyToAddressBook(true);
      setSignedUpByUserId(currentUser?.id ? String(currentUser.id) : "");
      setIdempotencyKey(crypto.randomUUID().replace(/-/g, ""));
    },
    onError: (e: Error) => toast({ title: "Creation Failed", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name || !form.last_name || !form.email || !form.business_tax_id || !signedUpByUserId) {
      toast({ title: "Missing Fields", description: "First name, last name, business tax ID, email, and Signed up by are required.", variant: "destructive" });
      return;
    }
    if (!effectiveShipping.address1 || !effectiveShipping.city || !effectiveShipping.state_or_province || !effectiveShipping.postal_code) {
      toast({ title: "Shipping address required", description: "Enter a complete shipping address for the customer address book.", variant: "destructive" });
      return;
    }
    mutation.mutate({
      ...form,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || undefined,
      company: form.company.trim() || undefined,
      business_tax_id: form.business_tax_id.trim(),
      signed_up_by_user_id: Number(signedUpByUserId),
      shipping_address: Object.fromEntries(Object.entries(effectiveShipping).map(([key, value]) => [key, value.trim()])) as Address,
      idempotency_key: idempotencyKey,
    });
  };

  return (
    <div className="bg-slate-50 flex flex-col">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3 shrink-0">
        <UserPlus className="h-5 w-5 text-slate-600" />
        <div>
          <h1 className="text-base font-bold text-slate-800">Create BC Customer</h1>
          <p className="text-xs text-slate-400">Added to “{groupName}” automatically</p>
        </div>
      </header>

      <div className="p-4 max-w-2xl mx-auto w-full">
        <form onSubmit={handleSubmit} className="space-y-5" data-testid="form-create-customer">
          <section className="bg-white rounded-lg border shadow-sm p-4 space-y-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Customer Details</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="First Name" id="first_name" required value={form.first_name} onChange={set("first_name")} placeholder="Jane" />
              <Field label="Last Name" id="last_name" required value={form.last_name} onChange={set("last_name")} placeholder="Smith" />
            </div>
            <Field label="Email Address" id="email" type="email" required value={form.email} onChange={set("email")} placeholder="jane@example.com" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Phone Number" id="phone" type="tel" value={form.phone} onChange={set("phone")} placeholder="+1 555 000 0000" />
              <Field label="Company" id="company" value={form.company} onChange={set("company")} placeholder="Acme Corp" />
            </div>
            <Field label="Business Tax ID" id="business_tax_id" required value={form.business_tax_id} onChange={set("business_tax_id")} placeholder="Enter business tax ID" />
            <div className="space-y-1">
              <Label className="text-xs font-medium text-slate-700">Signed up by<span className="ml-0.5 text-red-500">*</span></Label>
              <Select value={signedUpByUserId} onValueChange={setSignedUpByUserId}>
                <SelectTrigger data-testid="select-signed-up-by"><SelectValue placeholder="Choose an app user" /></SelectTrigger>
                <SelectContent>
                  {activeUsers.map((user) => <SelectItem key={user.id} value={String(user.id)}>{user.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-400">Saved to BigCommerce and assigned as the CRM Primary Rep.</p>
            </div>
          </section>

          <section className="bg-white rounded-lg border shadow-sm p-4 space-y-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-slate-500" />
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Customer Address</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Address Line 1" id="address1" value={form.address1} onChange={set("address1")} placeholder="123 Main St" />
              <Field label="Address Line 2" id="address2" value={form.address2} onChange={set("address2")} placeholder="Suite 100" />
              <Field label="City" id="city" value={form.city} onChange={set("city")} placeholder="New York" />
              <Field label="State / Province" id="state_or_province" value={form.state_or_province} onChange={set("state_or_province")} placeholder="NY" />
              <Field label="ZIP / Postal Code" id="postal_code" value={form.postal_code} onChange={set("postal_code")} placeholder="10001" />
              <Field label="Country Code" id="country_code" value={form.country_code} onChange={set("country_code")} placeholder="US" />
            </div>
          </section>

          <section className="bg-white rounded-lg border shadow-sm p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Shipping Address Book</p>
                <p className="mt-1 text-[11px] text-slate-400">Required for customer checkout.</p>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="copy-address" checked={copyToAddressBook} onCheckedChange={(checked) => setCopyToAddressBook(checked === true)} data-testid="checkbox-copy-address" />
                <Label htmlFor="copy-address" className="text-xs font-medium cursor-pointer flex items-center gap-1"><ClipboardCopy className="h-3.5 w-3.5" /> Copy details above</Label>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="First Name" id="shipping_first_name" required value={effectiveShipping.first_name} onChange={setShippingField("first_name")} disabled={copyToAddressBook} />
              <Field label="Last Name" id="shipping_last_name" required value={effectiveShipping.last_name} onChange={setShippingField("last_name")} disabled={copyToAddressBook} />
              <Field label="Company" id="shipping_company" value={effectiveShipping.company} onChange={setShippingField("company")} disabled={copyToAddressBook} />
              <Field label="Phone Number" id="shipping_phone" value={effectiveShipping.phone} onChange={setShippingField("phone")} disabled={copyToAddressBook} />
              <Field label="Address Line 1" id="shipping_address1" required value={effectiveShipping.address1} onChange={setShippingField("address1")} disabled={copyToAddressBook} />
              <Field label="Address Line 2" id="shipping_address2" value={effectiveShipping.address2} onChange={setShippingField("address2")} disabled={copyToAddressBook} />
              <Field label="City" id="shipping_city" required value={effectiveShipping.city} onChange={setShippingField("city")} disabled={copyToAddressBook} />
              <Field label="State / Province" id="shipping_state" required value={effectiveShipping.state_or_province} onChange={setShippingField("state_or_province")} disabled={copyToAddressBook} />
              <Field label="ZIP / Postal Code" id="shipping_postal_code" required value={effectiveShipping.postal_code} onChange={setShippingField("postal_code")} disabled={copyToAddressBook} />
              <Field label="Country Code" id="shipping_country_code" value={effectiveShipping.country_code} onChange={setShippingField("country_code")} disabled={copyToAddressBook} />
            </div>
          </section>

          <Button type="submit" className="w-full h-10" disabled={mutation.isPending} data-testid="btn-submit-create-customer">
            {mutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating Customer…</> : <><UserPlus className="h-4 w-4 mr-2" /> Create Customer in BigCommerce</>}
          </Button>
        </form>
      </div>
    </div>
  );
}