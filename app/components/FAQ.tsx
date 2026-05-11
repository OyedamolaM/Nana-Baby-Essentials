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
    <section className="bg-gray-50 py-14 md:py-20">
      <div className="container mx-auto px-4">
        <div className="mb-12 text-center">
          <p className="brand-script-label mb-3">
            {eyebrow}
          </p>
          <h2 className="section-title mb-4">
            {title}
          </h2>
          <p className="section-copy-lg mx-auto max-w-2xl">
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
                <AccordionTrigger className="text-left hover:no-underline md:text-base">
                  <span className="font-semibold text-gray-900 md:text-[16px]">{faq.question}</span>
                </AccordionTrigger>
                <AccordionContent className="text-sm text-gray-600 md:text-[14px] md:leading-7">
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
