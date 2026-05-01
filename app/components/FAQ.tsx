'use client'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";

export function FAQ() {
  const faqs = [
    {
      question: "What payment methods do you accept?",
      answer: "We accept payments via Paystack, including debit cards, credit cards, bank transfers, and USSD. All transactions are secure and encrypted."
    },
    {
      question: "How long does delivery take?",
      answer: "Delivery typically takes 2-5 business days within Lagos and 3-7 business days for other locations in Nigeria. Express delivery options are available for faster shipping."
    },
    {
      question: "What is your return policy?",
      answer: "We offer a 30-day return policy for unused items in their original packaging. Simply contact our customer service team to initiate a return."
    },
    {
      question: "Are your products safe for babies?",
      answer: "Absolutely! All our products meet international safety standards and are tested for quality. We only work with certified brands that prioritize baby safety."
    },
    {
      question: "How does the Baby Registry work?",
      answer: "Create a registry by selecting your favorite products, then share your unique registry link with family and friends. They can purchase items directly from your list, and you'll receive a 15% discount on remaining items after your event."
    },
    {
      question: "Do you offer gift wrapping?",
      answer: "Yes! We offer complimentary gift wrapping for purchases over ₦20,000. Just select the gift wrap option at checkout."
    },
    {
      question: "Can I track my order?",
      answer: "Yes, once your order ships, you'll receive a tracking number via email. You can also track your order status in your account dashboard."
    },
    {
      question: "Do you have a physical store?",
      answer: "While we primarily operate online, we have a showroom in Lagos where you can view select products. Please contact us to schedule a visit."
    }
  ];

  return (
    <section className="py-20 bg-gray-50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Frequently Asked Questions
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Have questions? We&apos;ve got answers! Here are some common questions from our customers.
          </p>
        </div>

        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="bg-white rounded-lg border px-6"
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
