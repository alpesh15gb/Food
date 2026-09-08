import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";

export default function AuthDrawer({
  open,
  onOpenChange,
  loggedInPhone,
  customerMeData,
  onSendOtp,
  onVerifyOtp,
  onLogout,
  otpStep,
  setOtpStep,
  otpPhone,
  setOtpPhone,
  otpCode,
  setOtpCode,
  otpLoading,
  otpError,
  setOtpError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loggedInPhone: string | null;
  customerMeData: { phone: string | null; totalOrders: number } | null | undefined;
  onSendOtp: () => void;
  onVerifyOtp: () => void;
  onLogout: () => void;
  otpStep: "phone" | "verify";
  setOtpStep: (step: "phone" | "verify") => void;
  otpPhone: string;
  setOtpPhone: (phone: string) => void;
  otpCode: string;
  setOtpCode: (code: string) => void;
  otpLoading: boolean;
  otpError: string;
  setOtpError: (error: string) => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]" style={{ background: "var(--sf-bg)" }}>
        <DrawerHeader className="px-6 pb-2 text-left">
          <DrawerTitle
            className="sf-heading text-2xl"
            style={{ color: "var(--sf-text)" }}
          >
            {loggedInPhone ? "Your Account" : "Sign in to order"}
          </DrawerTitle>
          <DrawerDescription style={{ color: "var(--sf-text-secondary)" }}>
            {loggedInPhone
              ? `Logged in as ${loggedInPhone}`
              : "Enter your phone number to get started"}
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-6 pb-6">
          {loggedInPhone ? (
            <div className="space-y-4">
              {customerMeData && (
                <div
                  className="rounded-[var(--sf-radius-card)] border p-4"
                  style={{
                    borderColor: "var(--sf-border)",
                    background: "var(--sf-bg-subtle)",
                  }}
                >
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p
                        className="text-[10px] font-extrabold uppercase tracking-wider"
                        style={{ color: "var(--sf-text-muted)" }}
                      >
                        Phone
                      </p>
                      <p
                        className="mt-1 font-bold"
                        style={{ color: "var(--sf-text)" }}
                      >
                        {loggedInPhone}
                      </p>
                    </div>
                    <div>
                      <p
                        className="text-[10px] font-extrabold uppercase tracking-wider"
                        style={{ color: "var(--sf-text-muted)" }}
                      >
                        Total Orders
                      </p>
                      <p
                        className="mt-1 font-bold"
                        style={{ color: "var(--sf-text)" }}
                      >
                        {customerMeData.totalOrders}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              <Button
                onClick={onLogout}
                variant="outline"
                className="w-full rounded-[var(--sf-radius-btn)] font-extrabold"
                style={{
                  borderColor: "var(--sf-border)",
                  color: "var(--sf-red)",
                }}
              >
                Sign out
              </Button>
            </div>
          ) : otpStep === "phone" ? (
            <div className="space-y-4">
              <Input
                value={otpPhone}
                onChange={(e) => {
                  setOtpPhone(e.target.value);
                  setOtpError("");
                }}
                placeholder="10-digit phone number"
                type="tel"
                inputMode="numeric"
                maxLength={15}
                className="h-12 rounded-[var(--sf-radius-btn)] text-base"
                style={{ borderColor: "var(--sf-border)" }}
              />
              {otpError && (
                <p className="text-sm font-bold" style={{ color: "var(--sf-red)" }}>
                  {otpError}
                </p>
              )}
              <Button
                onClick={onSendOtp}
                disabled={
                  otpLoading || otpPhone.replace(/[^\d]/g, "").length < 10
                }
                className="h-12 w-full rounded-[var(--sf-radius-btn)] text-base font-extrabold text-white"
                style={{ background: "var(--sf-primary)" }}
              >
                {otpLoading ? "Sending..." : "Send verification code"}
              </Button>
              <p
                className="text-center text-xs"
                style={{ color: "var(--sf-text-muted)" }}
              >
                We'll send a 6-digit code to verify your number.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm" style={{ color: "var(--sf-text-secondary)" }}>
                Enter the 6-digit code sent to {otpPhone}
              </p>
              <Input
                value={otpCode}
                onChange={(e) => {
                  setOtpCode(e.target.value);
                  setOtpError("");
                }}
                placeholder="000000"
                type="text"
                inputMode="numeric"
                maxLength={6}
                className="h-12 rounded-[var(--sf-radius-btn)] text-center text-2xl font-mono tracking-[0.3em]"
                style={{ borderColor: "var(--sf-border)" }}
              />
              {otpError && (
                <p className="text-sm font-bold" style={{ color: "var(--sf-red)" }}>
                  {otpError}
                </p>
              )}
              <Button
                onClick={onVerifyOtp}
                disabled={otpLoading || otpCode.length !== 6}
                className="h-12 w-full rounded-[var(--sf-radius-btn)] text-base font-extrabold text-white"
                style={{ background: "var(--sf-primary)" }}
              >
                {otpLoading ? "Verifying..." : "Verify & continue"}
              </Button>
              <button
                onClick={() => {
                  setOtpStep("phone");
                  setOtpCode("");
                  setOtpError("");
                }}
                className="w-full text-center text-xs font-bold underline"
                style={{ color: "var(--sf-text-muted)" }}
              >
                Change phone number
              </button>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
