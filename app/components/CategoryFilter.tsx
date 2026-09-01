'use client'
import { Button } from "./ui/button";

interface CategoryFilterProps {
  className?: string;
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
}

export function CategoryFilter({
  className = "",
  categories,
  selectedCategory,
  onSelectCategory,
}: CategoryFilterProps) {
  return (
    <div className={`mb-6 flex justify-start overflow-x-auto pb-2 ${className}`.trim()}>
      <div className="flex w-max gap-2 px-1">
        {categories.map((category) => (
          <Button
            key={category}
            type="button"
            variant={selectedCategory === category ? "default" : "outline"}
            onClick={() => onSelectCategory(category)}
            className="min-w-[6.5rem] shrink-0 justify-center rounded-full"
          >
            {category}
          </Button>
        ))}
      </div>
    </div>
  );
}
