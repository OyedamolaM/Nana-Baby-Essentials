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
    <div className={`mb-6 flex flex-wrap justify-start gap-2 px-1 ${className}`.trim()}>
      {categories.map((category) => (
        <Button
          key={category}
          type="button"
          variant={selectedCategory === category ? "default" : "outline"}
          onClick={() => onSelectCategory(category)}
          className="min-w-[6.5rem] justify-center rounded-full"
        >
          {category}
        </Button>
      ))}
    </div>
  );
}
