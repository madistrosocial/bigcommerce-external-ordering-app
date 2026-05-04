import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Loader2 } from "lucide-react";
import * as api from "@/lib/api";

// ─── API call ─────────────────────────────────────────────────────────────────

interface CreateCustomerPayload {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state_or_province?: string;
  postal_code?: string;
  country_code?: string;
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

// ─── Field helper ─────────────────────────────────────────────────────────────

function Field({
  label,
  id,
  required,
  type = "text",
  value,
  onChange,
  placeholder,
}: {
  label: string;
  id: string;
  required?: boolean;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-medium text-slate-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        data-testid={`input-${id}`}
        className="h-9 text-sm"
      />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const EMPTY = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  company: "",
  address1: "",
  address2: "",
  city: "",
  state_or_province: "",
  postal_code: "",
  country_code: "US",
};

export default function CreateCustomer() {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY);

  const set = (key: keyof typeof EMPTY) => (val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const mutation = useMutation({
    mutationFn: createBcCustomer,
    onSuccess: () => {
      toast({
        title: "Customer Created",
        description: `${form.first_name} ${form.last_name} has been added to BigCommerce and placed in the Verification Pending group.`,
      });
      setForm(EMPTY);
    },
    onError: (e: any) => {
      toast({ title: "Creation Failed", description: e.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name || !form.last_name || !form.email) {
      toast({ title: "Missing Fields", description: "First name, last name, and email are required.", variant: "destructive" });
      return;
    }
    mutation.mutate({
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || undefined,
      company: form.company.trim() || undefined,
      address1: form.address1.trim() || undefined,
      address2: form.address2.trim() || undefined,
      city: form.city.trim() || undefined,
      state_or_province: form.state_or_province.trim() || undefined,
      postal_code: form.postal_code.trim() || undefined,
      country_code: form.country_code.trim() || "US",
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3 shrink-0">
        <UserPlus className="h-5 w-5 text-slate-600" />
        <h1 className="text-base font-bold text-slate-800">Create BC Customer</h1>
        <span className="ml-2 text-xs text-slate-400">Added to "Verification Pending" group automatically</span>
      </header>

      <div className="flex-1 overflow-auto p-4 max-w-xl mx-auto w-full">
        <form onSubmit={handleSubmit} className="space-y-6" data-testid="form-create-customer">

          {/* Personal info */}
          <section className="bg-white rounded-lg border shadow-sm p-4 space-y-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Personal Information</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="First Name" id="first_name" required value={form.first_name} onChange={set("first_name")} placeholder="Jane" />
              <Field label="Last Name" id="last_name" required value={form.last_name} onChange={set("last_name")} placeholder="Smith" />
            </div>
            <Field label="Email Address" id="email" type="email" required value={form.email} onChange={set("email")} placeholder="jane@example.com" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone Number" id="phone" type="tel" value={form.phone} onChange={set("phone")} placeholder="+1 555 000 0000" />
              <Field label="Company" id="company" value={form.company} onChange={set("company")} placeholder="Acme Corp" />
            </div>
          </section>

          {/* Address */}
          <section className="bg-white rounded-lg border shadow-sm p-4 space-y-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Address <span className="text-slate-400 font-normal normal-case">(optional)</span></p>
            <Field label="Address Line 1" id="address1" value={form.address1} onChange={set("address1")} placeholder="123 Main St" />
            <Field label="Address Line 2" id="address2" value={form.address2} onChange={set("address2")} placeholder="Suite 100" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="City" id="city" value={form.city} onChange={set("city")} placeholder="New York" />
              <Field label="State / Province" id="state_or_province" value={form.state_or_province} onChange={set("state_or_province")} placeholder="NY" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="ZIP / Postal Code" id="postal_code" value={form.postal_code} onChange={set("postal_code")} placeholder="10001" />
              <Field label="Country Code" id="country_code" value={form.country_code} onChange={set("country_code")} placeholder="US" />
            </div>
          </section>

          <Button
            type="submit"
            className="w-full h-10"
            disabled={mutation.isPending}
            data-testid="btn-submit-create-customer"
          >
            {mutation.isPending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating Customer…</>
              : <><UserPlus className="h-4 w-4 mr-2" /> Create Customer in BigCommerce</>}
          </Button>
        </form>
      </div>
    </div>
  );
}
