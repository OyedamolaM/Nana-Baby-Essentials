"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { getCurrentProductReturnPath, readProductDetailReturnContext } from "../../lib/productDetailReturn";

function scrollToSection(section: HTMLElement | null) {
  if (!section) return;
  const header = document.querySelector("header")?.getBoundingClientRect().height ?? 82;
  window.scrollTo({ top: Math.max(0, section.getBoundingClientRect().top + window.scrollY - header - 12), behavior: "instant" });
}

export function useProductSectionPagination(ref: RefObject<HTMLElement | null>, setPage: (page: number) => void, page: number, loading: boolean) {
  const pending = useRef(false);
  useEffect(() => {
    if (!pending.current || loading) return;
    const frame = requestAnimationFrame(() => { scrollToSection(ref.current); pending.current = false; });
    return () => cancelAnimationFrame(frame);
  }, [loading, page, ref]);
  return useCallback((next: number) => {
    if (next === page || next < 1) return;
    pending.current = true;
    scrollToSection(ref.current);
    setPage(next);
  }, [page, ref, setPage]);
}

export function useRestoreProductScroll() {
  useEffect(() => {
    const context = readProductDetailReturnContext();
    if (!context || context.originPath !== getCurrentProductReturnPath() || typeof context.scrollY !== "number") return;
    let frame = 0;
    const restore = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => window.scrollTo({ top: context.scrollY!, behavior: "instant" }));
    };
    const observer = new ResizeObserver(restore);
    observer.observe(document.body);
    restore();
    const stop = () => {
      observer.disconnect();cancelAnimationFrame(frame);clearTimeout(timer);
      window.removeEventListener("wheel", stop);window.removeEventListener("touchstart", stop);window.removeEventListener("keydown", stop);
    };
    const timer = window.setTimeout(stop, 5000);
    window.addEventListener("wheel", stop, { passive: true });window.addEventListener("touchstart", stop, { passive: true });window.addEventListener("keydown", stop);
    return stop;
  }, []);
}
