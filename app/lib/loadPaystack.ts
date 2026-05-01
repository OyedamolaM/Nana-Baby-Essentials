declare global {
  interface Window {
    PaystackPop?: {
      setup: (config: Record<string, unknown>) => {
        openIframe: () => void;
      };
    };
  }
}

const PAYSTACK_SCRIPT_ID = "paystack-inline-js";
const PAYSTACK_SCRIPT_URL = "https://js.paystack.co/v1/inline.js";

export function loadPaystackScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Paystack is only available in the browser."));
  }

  if (window.PaystackPop) {
    return Promise.resolve();
  }

  const existingScript = document.getElementById(
    PAYSTACK_SCRIPT_ID,
  ) as HTMLScriptElement | null;

  if (existingScript) {
    return new Promise<void>((resolve, reject) => {
      existingScript.addEventListener("load", () => resolve());
      existingScript.addEventListener("error", () =>
        reject(new Error("Failed to load Paystack.")),
      );
    });
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = PAYSTACK_SCRIPT_ID;
    script.src = PAYSTACK_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Paystack."));
    document.body.appendChild(script);
  });
}
