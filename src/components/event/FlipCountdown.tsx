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
      <div className="relative w-16 h-20 md:w-20 md:h-24">
        <div className="absolute inset-0 bg-gradient-to-b from-card to-card/80 rounded-lg border-2 border-primary/20 shadow-lg overflow-hidden">
          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center text-3xl md:text-4xl font-bold text-primary transition-transform duration-300",
              flip && "animate-[flip_0.6s_ease-in-out]"
            )}
          >
            {displayValue}
          </div>
        </div>
        {/* Top separator line */}
        <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-background/50 z-10" />
      </div>
      <span className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider">
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
    <div className="bg-gradient-to-br from-card to-muted/30 rounded-lg p-6 border shadow-lg">
      <h3 className="text-center text-lg md:text-xl font-bold text-foreground mb-6 tracking-tight">
        PREPARE-SE! FALTAM:
      </h3>
      <div className="flex justify-center gap-3 md:gap-4">
        <FlipDigit value={timeLeft.days} label="Dias" />
        <div className="flex items-center pb-8">
          <span className="text-2xl md:text-3xl font-bold text-primary">:</span>
        </div>
        <FlipDigit value={timeLeft.hours} label="Horas" />
        <div className="flex items-center pb-8">
          <span className="text-2xl md:text-3xl font-bold text-primary">:</span>
        </div>
        <FlipDigit value={timeLeft.minutes} label="Min" />
        <div className="flex items-center pb-8">
          <span className="text-2xl md:text-3xl font-bold text-primary">:</span>
        </div>
        <FlipDigit value={timeLeft.seconds} label="Seg" />
      </div>
    </div>
  );
};
