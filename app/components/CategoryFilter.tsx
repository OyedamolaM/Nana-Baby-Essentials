'use client'
import { Button } from "./ui/button";

interface CategoryFilterProps {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
}

export function CategoryFilter({ categories, selectedCategory, onSelectCategory }: CategoryFilterProps) {
  return (
    <div className="mb-6 overflow-x-auto pb-2">
      <div className="flex w-max min-w-full gap-2">
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
