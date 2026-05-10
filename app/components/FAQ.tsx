'use client'

import { HOME_FAQS, type FaqItem } from "../../lib/faqContent";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";

export function FAQ({
  description = "Have questions? We've got answers! Here are some common questions from our customers.",
  eyebrow = "FAQ",
  faqs = HOME_FAQS,
  title = "Frequently Asked Questions",
}: {
  description?: string;
  eyebrow?: string;
  faqs?: FaqItem[];
  title?: string;
}) {
  return (
    <section className="bg-gray-50 py-20">
      <div className="container mx-auto px-4">
        <div className="mb-12 text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-pink-600">
            {eyebrow}
          </p>
          <h2 className="mb-4 text-4xl font-bold text-gray-900">
            {title}
          </h2>
          <p className="mx-auto max-w-2xl text-xl text-gray-600">
            {description}
          </p>
        </div>

        <div className="mx-auto max-w-3xl">
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={faq.question}
                value={`item-${index}`}
                className="rounded-lg border bg-white px-6"
              >
                <AccordionTrigger className="text-left hover:no-underline">
                  <span className="font-semibold text-gray-900">{faq.question}</span>
                </AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
