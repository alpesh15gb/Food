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
    onSuccess: () => {
      toast.success("Welcome! Your restaurant has been created.");
      setLocation("/admin");
    },
    onError: (err) => toast.error(err.message),
  });

  const login = trpc.auth.login.useMutation({
    onSuccess: () => {
      toast.success("Signed in successfully.");
      setLocation("/admin");
    },
    onError: (err) => toast.error(err.message),
  });

  const [isLogin, setIsLogin] = useState(false);

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
    if (field === "restaurantName") {
      const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      setForm(prev => ({ ...prev, restaurantName: value, restaurantSlug: slug }));
    }
  }

  function handleAccountNext(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) {
      toast.error("Please fill in all fields.");
      return;
    }
    if (form.password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    setStep("restaurant");
  }

  function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!form.restaurantName || !form.address) {
      toast.error("Restaurant name and address are required.");
      return;
    }
    register.mutate(form);
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
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#38271F] text-white mb-4">
              <ChefHat className="w-8 h-8" />
            </div>
            <h1 className="text-3xl font-bold text-[#38271F]" style={{ fontFamily: "'Playfair Display', serif" }}>
              Welcome Back
            </h1>
            <p className="text-[#6b5c52]">Sign in to manage your restaurant</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4 bg-white rounded-2xl p-8 shadow-sm border border-[#e8ddd0]">
            <div className="space-y-2">
              <Label htmlFor="login-email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-[#a09080]" />
                <Input id="login-email" type="email" placeholder="you@restaurant.com" className="pl-10" value={form.email} onChange={e => update("email", e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-4 h-4 text-[#a09080]" />
                <Input id="login-password" type="password" placeholder="Your password" className="pl-10" value={form.password} onChange={e => update("password", e.target.value)} />
              </div>
            </div>
            <Button type="submit" className="w-full bg-[#38271F] hover:bg-[#2a1d17] text-white" disabled={isLoading}>
              {isLoading ? <LoaderCircle className="w-4 h-4 animate-spin mr-2" /> : null}
              Sign In
            </Button>
          </form>

          <p className="text-center text-sm text-[#6b5c52]">
            Don't have an account?{" "}
            <button onClick={() => setIsLogin(false)} className="text-[#38271F] font-semibold hover:underline">
              Create one
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
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#38271F] text-white mb-4">
            <ChefHat className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-[#38271F]" style={{ fontFamily: "'Playfair Display', serif" }}>
            Start Your Restaurant
          </h1>
          <p className="text-[#6b5c52]">Create your branded ordering page in minutes</p>
        </div>

        <div className="flex gap-2 mb-6">
          <div className={`flex-1 h-1.5 rounded-full ${step === "account" ? "bg-[#38271F]" : "bg-[#38271F]/30"}`} />
          <div className={`flex-1 h-1.5 rounded-full ${step === "restaurant" ? "bg-[#38271F]" : "bg-[#38271F]/30"}`} />
        </div>

        {step === "account" ? (
          <form onSubmit={handleAccountNext} className="space-y-4 bg-white rounded-2xl p-8 shadow-sm border border-[#e8ddd0]">
            <div className="space-y-2">
              <Label htmlFor="name">Your Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-4 h-4 text-[#a09080]" />
                <Input id="name" placeholder="John Doe" className="pl-10" value={form.name} onChange={e => update("name", e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-[#a09080]" />
                <Input id="email" type="email" placeholder="you@restaurant.com" className="pl-10" value={form.email} onChange={e => update("email", e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-4 h-4 text-[#a09080]" />
                <Input id="password" type="password" placeholder="At least 8 characters" className="pl-10" value={form.password} onChange={e => update("password", e.target.value)} />
              </div>
            </div>
            <Button type="submit" className="w-full bg-[#38271F] hover:bg-[#2a1d17] text-white">
              Continue
            </Button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4 bg-white rounded-2xl p-8 shadow-sm border border-[#e8ddd0]">
            <div className="space-y-2">
              <Label htmlFor="restaurantName">Restaurant Name</Label>
              <div className="relative">
                <Store className="absolute left-3 top-3 w-4 h-4 text-[#a09080]" />
                <Input id="restaurantName" placeholder="Your Restaurant Name" className="pl-10" value={form.restaurantName} onChange={e => update("restaurantName", e.target.value)} />
              </div>
            </div>
            {form.restaurantSlug && (
              <p className="text-xs text-[#6b5c52] -mt-2">
                Your storefront URL: <span className="font-mono text-[#38271F]">/{form.restaurantSlug}</span>
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="cuisineSummary">Cuisine Type</Label>
              <Input id="cuisineSummary" placeholder="North Indian, Chinese, Biryani" value={form.cuisineSummary} onChange={e => update("cuisineSummary", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 w-4 h-4 text-[#a09080]" />
                <Input id="address" placeholder="Full address of your kitchen" className="pl-10" value={form.address} onChange={e => update("address", e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactPhone">Contact Phone (optional)</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 w-4 h-4 text-[#a09080]" />
                <Input id="contactPhone" placeholder="+91 98765 43210" className="pl-10" value={form.contactPhone} onChange={e => update("contactPhone", e.target.value)} />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep("account")}>
                Back
              </Button>
              <Button type="submit" className="flex-1 bg-[#38271F] hover:bg-[#2a1d17] text-white" disabled={isLoading}>
                {isLoading ? <LoaderCircle className="w-4 h-4 animate-spin mr-2" /> : null}
                Create Restaurant
              </Button>
            </div>
          </form>
        )}

        <p className="text-center text-sm text-[#6b5c52]">
          Already have an account?{" "}
          <button onClick={() => setIsLogin(true)} className="text-[#38271F] font-semibold hover:underline">
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
