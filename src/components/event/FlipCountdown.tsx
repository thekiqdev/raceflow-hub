import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface FlipCountdownProps {
  targetDate: string;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const FlipDigit = ({ value, label }: { value: number; label: string }) => {
  const [flip, setFlip] = useState(false);
  const [prevValue, setPrevValue] = useState(value);

  useEffect(() => {
    if (value !== prevValue) {
      setFlip(true);
      setTimeout(() => {
        setPrevValue(value);
        setFlip(false);
      }, 300);
    }
  }, [value, prevValue]);

  const displayValue = value.toString().padStart(2, "0");

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-10 h-12 md:w-12 md:h-14">
        <div className="absolute inset-0 bg-background rounded-lg border border-border shadow-sm overflow-hidden">
          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center text-xl md:text-2xl font-bold text-primary transition-all duration-300",
              flip && "animate-[flip_0.6s_ease-in-out]"
            )}
          >
            {displayValue}
          </div>
        </div>
        {/* Top separator line */}
        <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-border z-10" />
      </div>
      <span className="text-[9px] md:text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
    </div>
  );
};

export const FlipCountdown = ({ targetDate }: FlipCountdownProps) => {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = +new Date(targetDate) - +new Date();

      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        });
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  return (
    <div className="bg-card rounded-xl p-3 md:p-4 border shadow-sm">
      <h3 className="text-center text-sm md:text-base font-bold text-foreground mb-3 md:mb-4 tracking-tight">
        PREPARE-SE! FALTAM:
      </h3>
      <div className="flex justify-center items-start gap-1 md:gap-1.5">
        <FlipDigit value={timeLeft.days} label="Dias" />
        <div className="flex items-center pt-1 pb-5">
          <span className="text-lg md:text-xl font-bold text-primary/40">:</span>
        </div>
        <FlipDigit value={timeLeft.hours} label="Horas" />
        <div className="flex items-center pt-1 pb-5">
          <span className="text-lg md:text-xl font-bold text-primary/40">:</span>
        </div>
        <FlipDigit value={timeLeft.minutes} label="Min" />
        <div className="flex items-center pt-1 pb-5">
          <span className="text-lg md:text-xl font-bold text-primary/40">:</span>
        </div>
        <FlipDigit value={timeLeft.seconds} label="Seg" />
      </div>
    </div>
  );
};
