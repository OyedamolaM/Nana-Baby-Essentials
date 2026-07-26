"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Clock3, X } from "lucide-react";

import { Button } from "../ui/button";
import { Calendar } from "../ui/calendar";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { cn } from "../ui/utils";

function padNumber(value: number) {
  return String(value).padStart(2, "0");
}

function parseLocalDateTime(value?: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function toLocalDateTimeValue(date: Date, timeValue: string) {
  const [rawHours = "00", rawMinutes = "00"] = timeValue.split(":");
  const hours = Number(rawHours);
  const minutes = Number(rawMinutes);
  const nextDate = new Date(date);

  nextDate.setHours(
    Number.isFinite(hours) ? hours : 0,
    Number.isFinite(minutes) ? minutes : 0,
    0,
    0,
  );

  return [
    nextDate.getFullYear(),
    padNumber(nextDate.getMonth() + 1),
    padNumber(nextDate.getDate()),
  ].join("-") + `T${padNumber(nextDate.getHours())}:${padNumber(nextDate.getMinutes())}`;
}

function formatDisplayDate(value?: string | null) {
  const date = parseLocalDateTime(value);
  if (!date) {
    return "";
  }

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getTimeValue(value?: string | null) {
  if (!value || value.length < 16) {
    return "";
  }

  return value.slice(11, 16);
}

type AdminDateTimeFieldProps = {
  className?: string;
  defaultTime?: string;
  description?: string;
  id: string;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
};

export function AdminDateTimeField({
  className,
  defaultTime = "09:00",
  description,
  id,
  label,
  onChange,
  placeholder = "DD/MM/YYYY",
  value,
}: AdminDateTimeFieldProps) {
  const [draftTime, setDraftTime] = useState(defaultTime);
  const selectedDate = useMemo(() => parseLocalDateTime(value), [value]);
  const displayDate = useMemo(() => formatDisplayDate(value), [value]);
  const timeValue = getTimeValue(value) || draftTime || defaultTime;

  const handleDateSelect = (nextDate?: Date) => {
    if (!nextDate) {
      onChange("");
      return;
    }

    onChange(toLocalDateTimeValue(nextDate, timeValue));
  };

  const handleTimeChange = (nextTime: string) => {
    setDraftTime(nextTime);

    if (!selectedDate) {
      return;
    }

    onChange(toLocalDateTimeValue(selectedDate, nextTime));
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              className={cn(
                "w-full justify-between text-left font-normal sm:flex-1",
                !displayDate && "text-muted-foreground",
              )}
            >
              <span>{displayDate || placeholder}</span>
              <CalendarDays className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <div className="space-y-3 p-3">
              <Calendar
                mode="single"
                selected={selectedDate ?? undefined}
                onSelect={handleDateSelect}
              />
              <div className="flex items-center justify-end border-t pt-3">
                {value ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={() => onChange("")}
                  >
                    <X className="h-4 w-4" />
                    Clear
                  </Button>
                ) : null}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <div className="flex items-center gap-2 sm:w-auto">
          <Clock3 className="h-4 w-4 text-gray-500" />
          <Input
            type="time"
            value={timeValue}
            onChange={(event) => handleTimeChange(event.target.value)}
            className="w-full sm:w-[170px]"
          />
        </div>
      </div>
      {description ? <p className="text-xs text-gray-500">{description}</p> : null}
    </div>
  );
}
