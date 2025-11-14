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
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-14 h-16 md:w-16 md:h-20">
        <div className="absolute inset-0 bg-background rounded-lg border border-border shadow-sm overflow-hidden">
          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center text-2xl md:text-3xl font-bold text-primary transition-all duration-300",
              flip && "animate-[flip_0.6s_ease-in-out]"
            )}
          >
            {displayValue}
          </div>
        </div>
        {/* Top separator line */}
        <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-border z-10" />
      </div>
      <span className="text-[10px] md:text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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
    <div className="bg-card rounded-2xl p-4 md:p-6 border shadow-sm">
      <h3 className="text-center text-base md:text-lg font-bold text-foreground mb-4 md:mb-6 tracking-tight">
        PREPARE-SE! FALTAM:
      </h3>
      <div className="flex justify-center items-start gap-1.5 md:gap-2">
        <FlipDigit value={timeLeft.days} label="Dias" />
        <div className="flex items-center pt-1 pb-7">
          <span className="text-xl md:text-2xl font-bold text-primary/40">:</span>
        </div>
        <FlipDigit value={timeLeft.hours} label="Horas" />
        <div className="flex items-center pt-1 pb-7">
          <span className="text-xl md:text-2xl font-bold text-primary/40">:</span>
        </div>
        <FlipDigit value={timeLeft.minutes} label="Min" />
        <div className="flex items-center pt-1 pb-7">
          <span className="text-xl md:text-2xl font-bold text-primary/40">:</span>
        </div>
        <FlipDigit value={timeLeft.seconds} label="Seg" />
      </div>
    </div>
  );
};
