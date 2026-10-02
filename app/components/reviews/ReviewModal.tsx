"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { ReviewForm } from "./ReviewForm";

type ReviewModalOptions = {
  source?: "web" | "qr";
  storeSlug?: string;
};

type ReviewModalContextValue = {
  openReviewModal: (options?: ReviewModalOptions) => void;
};

const ReviewModalContext = createContext<ReviewModalContextValue | undefined>(
  undefined,
);

export function ReviewModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ReviewModalOptions>({});

  const openReviewModal = useCallback((nextOptions?: ReviewModalOptions) => {
    setOptions(nextOptions ?? {});
    setOpen(true);
  }, []);

  const value = useMemo(() => ({ openReviewModal }), [openReviewModal]);

  return (
    <ReviewModalContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Leave a review</DialogTitle>
            <DialogDescription>
              Tell us how your order, delivery, or in-store visit went.
            </DialogDescription>
          </DialogHeader>
          <ReviewForm
            source={options.source}
            storeSlug={options.storeSlug}
            onDone={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </ReviewModalContext.Provider>
  );
}

export function useReviewModal() {
  const context = useContext(ReviewModalContext);
  if (!context) {
    throw new Error("useReviewModal must be used within a ReviewModalProvider.");
  }

  return context;
}
