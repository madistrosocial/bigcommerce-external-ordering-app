import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/lib/api";

type CreateUserDialogProps = {
  onCreated?: () => void;
  className?: string;
};

export default function CreateUserDialog({ onCreated, className }: CreateUserDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));

    try {
      await api.createUser(data);
      onCreated?.();
      toast({ title: "User Created", description: `New ${data.role} account is ready.` });
      form.reset();
      setOpen(false);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={`gap-2 ${className ?? ""}`.trim()} data-testid="button-add-user">
          <Plus className="h-4 w-4" /> Add New User
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create User Account</DialogTitle>
          <DialogDescription>
            Fill in the details to create a new user account.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4 py-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="create-user-name">Full Name</Label>
            <Input id="create-user-name" name="name" placeholder="John Doe" required data-testid="input-user-name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-user-username">Username (Email)</Label>
            <Input id="create-user-username" name="username" type="email" placeholder="john@example.com" required data-testid="input-user-email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-user-password">Password</Label>
            <Input id="create-user-password" name="password" type="password" placeholder="••••••••" required data-testid="input-user-password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-user-role">Role</Label>
            <Select name="role" defaultValue="agent">
              <SelectTrigger id="create-user-role" data-testid="select-role">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="agent">Agent (Sales)</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" data-testid="button-create-user">Create Account</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}