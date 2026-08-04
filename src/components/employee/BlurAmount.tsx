"use client";

import { useEffect, useRef, useState } from "react";

interface BlurAmountProps {
  amount: number;
  currency?: string;
  blurred?: boolean;
  className?: string;
  amountClassName?: string;
  /** When provided, rendered instead of `{currency}{amount}` (e.g. a signed time string like "+01:30"). */
  formattedValue?: string;
}

export function BlurAmount({
  amount,
  currency = "৳",
  blurred = true,
  className = "",
  amountClassName = "text-base font-bold",
  formattedValue,
}: BlurAmountProps) {
  const [isVisible, setIsVisible] = useState(!blurred);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const showTemporarily = () => {
    clearHideTimer();
    setIsVisible(true);
    hideTimerRef.current = setTimeout(() => {
      setIsVisible(false);
      hideTimerRef.current = null;
    }, 3000);
  };

  const hideNow = () => {
    clearHideTimer();
    setIsVisible(false);
  };

  useEffect(() => {
    return () => clearHideTimer();
  }, []);

  return (
    <div className={`inline-flex items-center ${className}`}>
      <button
        type="button"
        onClick={() => {
          if (isVisible) {
            hideNow();
            return;
          }

          showTemporarily();
        }}
        className={`inline-flex items-center rounded-full border px-3 py-1.5 text-left transition-all duration-200 ${
          isVisible
            ? "border-transparent bg-transparent"
            : "border-dashed border-slate-300 bg-slate-100/80"
        }`}
        aria-label={isVisible ? "Amount visible. Click to hide." : "Amount hidden. Click to reveal for 3 seconds."}
      >
        <span className={isVisible ? amountClassName : `${amountClassName} blur-sm select-none`}>
          {formattedValue ?? `${currency}${amount.toLocaleString("en-BD")}`}
        </span>
      </button>
    </div>
  );
}
