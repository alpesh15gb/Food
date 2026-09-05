import { useState } from "react";
import { useLocation } from "wouter";
import { ChefHat, LoaderCircle, Lock, Mail, MapPin, Phone, Store, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

type Step = "account" | "restaurant";

export default function SignupPage() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("account");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    restaurantName: "",
    restaurantSlug: "",
    cuisineSummary: "",
    contactPhone: "",
    address: "",
  });

  const register = trpc.auth.register.useMutation({
    onSuccess: (result) => {
      toast.success("Welcome! Your restaurant has been created.");
      // Drop the password from memory — it must not linger in component state.
      setForm(prev => ({ ...prev, password: "" }));
      // Prefer the slug returned by the server; fall back to the slug preview.
      const returned = (result ?? {}) as { slug?: string; restaurantSlug?: string; restaurantId?: string };
      const slug = returned.slug || returned.restaurantSlug || form.restaurantSlug;
      setLocation(slug ? `/admin/${slug}/overview` : "/admin");
    },
    onError: (err) => toast.error(err.message),
  });

  const login = trpc.auth.login.useMutation({
    onSuccess: () => {
      toast.success("Signed in successfully.");
      setForm(prev => ({ ...prev, password: "" }));
      // Slug is unknown at login time; /admin resolves it via redirect helper.
      setLocation("/admin");
    },
    onError: (err) => toast.error(err.message),
  });

  const [isLogin, setIsLogin] = useState(false);

  function update(field: string, value: string) {
    if (field === "restaurantName") {
      const slug = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
      setForm(prev => ({ ...prev, restaurantName: value, restaurantSlug: slug }));
      return;
    }
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function handleAccountNext(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    const email = form.email.trim();
    if (!name || !email || !form.password) {
      toast.error("Please fill in all fields.");
      return;
    }
    if (name.length < 2) {
      toast.error("Please enter your name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    if (form.password.length < 8 || form.password.length > 128) {
      toast.error("Password must be 8–128 characters.");
      return;
    }
    setStep("restaurant");
  }

  function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    const restaurantName = form.restaurantName.trim();
    const slug = form.restaurantSlug.trim().toLowerCase();
    const address = form.address.trim();
    if (!restaurantName || restaurantName.length < 2) {
      toast.error("Restaurant name must be at least 2 characters.");
      return;
    }
    if (!slug || slug.length < 2 || slug.length > 64 || !/^[a-z0-9-]+$/.test(slug)) {
      toast.error("Storefront URL must be 2–64 chars: lowercase letters, numbers, hyphens.");
      return;
    }
    if (!address || address.length < 5) {
      toast.error("Please enter the full address of your kitchen (min 5 characters).");
      return;
    }
    register.mutate({ ...form, restaurantName, restaurantSlug: slug, address });
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    login.mutate({ email: form.email, password: form.password });
  }

  const isLoading = register.isPending || login.isPending;

  if (isLogin) {
    return (
      <div className="min-h-screen bg-[#f7f2eb] flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#2A3A0C] text-white mb-4">
              <ChefHat className="w-8 h-8" />
            </div>
            <h1 className="text-3xl font-bold text-[#2A3A0C]" style={{ fontFamily: "'Playfair Display', serif" }}>
              Welcome Back
            </h1>
            <p className="text-[#3F4C1E]">Sign in to manage your restaurant</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4 bg-white rounded-2xl p-8 shadow-sm border border-[#D8DFC0]">
            <div className="space-y-2">
              <Label htmlFor="login-email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-[#9AA07E]" />
                <Input id="login-email" type="email" placeholder="you@restaurant.com" className="pl-10" value={form.email} onChange={e => update("email", e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-4 h-4 text-[#9AA07E]" />
                <Input id="login-password" type="password" placeholder="Your password" className="pl-10" value={form.password} onChange={e => update("password", e.target.value)} />
              </div>
            </div>
            <Button type="submit" className="w-full bg-[#2A3A0C] hover:bg-[#2A3A0C] text-white" disabled={isLoading}>
              {isLoading ? <LoaderCircle className="w-4 h-4 animate-spin mr-2" /> : null}
              Sign In
            </Button>
          </form>

          <p className="text-center text-sm text-[#3F4C1E]">
            Don't have an account?{" "}
            <button onClick={() => setIsLogin(false)} className="text-[#2A3A0C] font-semibold hover:underline">
              Create one
            </button>
          </p>
          <p className="text-center text-sm text-[#3F4C1E]">
            <button onClick={() => toast.info("Password resets are handled by your restaurant owner.")} className="hover:underline">
              Forgot your password?
            </button>
            {" · "}
            <button onClick={() => setLocation("/")} className="hover:underline">
              Back to storefront
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f2eb] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#2A3A0C] text-white mb-4">
            <ChefHat className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-[#2A3A0C]" style={{ fontFamily: "'Playfair Display', serif" }}>
            Start Your Restaurant
          </h1>
          <p className="text-[#3F4C1E]">Create your branded ordering page in minutes</p>
        </div>

        <div className="flex gap-2 mb-6">
          <div className={`flex-1 h-1.5 rounded-full ${step === "account" ? "bg-[#2A3A0C]" : "bg-[#2A3A0C]/30"}`} />
          <div className={`flex-1 h-1.5 rounded-full ${step === "restaurant" ? "bg-[#2A3A0C]" : "bg-[#2A3A0C]/30"}`} />
        </div>

        {step === "account" ? (
          <form onSubmit={handleAccountNext} className="space-y-4 bg-white rounded-2xl p-8 shadow-sm border border-[#D8DFC0]">
            <div className="space-y-2">
              <Label htmlFor="name">Your Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-4 h-4 text-[#9AA07E]" />
                <Input id="name" placeholder="John Doe" className="pl-10" value={form.name} onChange={e => update("name", e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-[#9AA07E]" />
                <Input id="email" type="email" placeholder="you@restaurant.com" className="pl-10" value={form.email} onChange={e => update("email", e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-4 h-4 text-[#9AA07E]" />
                <Input id="password" type="password" placeholder="At least 8 characters" className="pl-10" value={form.password} onChange={e => update("password", e.target.value)} />
              </div>
            </div>
            <Button type="submit" className="w-full bg-[#2A3A0C] hover:bg-[#2A3A0C] text-white">
              Continue
            </Button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4 bg-white rounded-2xl p-8 shadow-sm border border-[#D8DFC0]">
            <div className="space-y-2">
              <Label htmlFor="restaurantName">Restaurant Name</Label>
              <div className="relative">
                <Store className="absolute left-3 top-3 w-4 h-4 text-[#9AA07E]" />
                <Input id="restaurantName" placeholder="Your Restaurant Name" className="pl-10" value={form.restaurantName} onChange={e => update("restaurantName", e.target.value)} />
              </div>
            </div>
            {form.restaurantSlug && (
              <p className="text-xs text-[#3F4C1E] -mt-2">
                Your storefront URL: <span className="font-mono text-[#2A3A0C]">/{form.restaurantSlug}</span>
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="restaurantSlug">Storefront URL (editable)</Label>
              <Input id="restaurantSlug" placeholder="your-restaurant" className="font-mono" value={form.restaurantSlug} onChange={e => update("restaurantSlug", e.target.value.toLowerCase())} maxLength={64} />
              <p className="text-xs text-[#3F4C1E]">Lowercase letters, numbers, hyphens only.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cuisineSummary">Cuisine Type</Label>
              <Input id="cuisineSummary" placeholder="North Indian, Chinese, Biryani" value={form.cuisineSummary} onChange={e => update("cuisineSummary", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 w-4 h-4 text-[#9AA07E]" />
                <Input id="address" placeholder="Full address of your kitchen" className="pl-10" value={form.address} onChange={e => update("address", e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactPhone">Contact Phone (optional)</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 w-4 h-4 text-[#9AA07E]" />
                <Input id="contactPhone" placeholder="+91 98765 43210" className="pl-10" value={form.contactPhone} onChange={e => update("contactPhone", e.target.value)} />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep("account")}>
                Back
              </Button>
              <Button type="submit" className="flex-1 bg-[#2A3A0C] hover:bg-[#2A3A0C] text-white" disabled={isLoading}>
                {isLoading ? <LoaderCircle className="w-4 h-4 animate-spin mr-2" /> : null}
                Create Restaurant
              </Button>
            </div>
          </form>
        )}

        <p className="text-center text-sm text-[#3F4C1E]">
          Already have an account?{" "}
          <button onClick={() => setIsLogin(true)} className="text-[#2A3A0C] font-semibold hover:underline">
            Sign in
          </button>
        </p>
        <p className="text-center text-sm text-[#3F4C1E]">
          <button onClick={() => setLocation("/")} className="hover:underline">
            Back to storefront
          </button>
        </p>
      </div>
    </div>
  );
}
