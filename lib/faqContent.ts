export type FaqItem = {
  answer: string;
  question: string;
};

export const HOME_FAQS: FaqItem[] = [
  {
    question: "What payment methods do you accept?",
    answer:
      "We accept payments via Paystack, including debit cards, credit cards, bank transfers, and USSD. All transactions are secure and encrypted.",
  },
  {
    question: "How long does delivery take?",
    answer:
      "Delivery typically takes 2-5 business days within Lagos and 3-7 business days for other locations in Nigeria. Express delivery options are available for faster shipping.",
  },
  {
    question: "What is your return policy?",
    answer:
      "We offer a 30-day return policy for unused items in their original packaging. Simply contact our customer service team to initiate a return.",
  },
  {
    question: "Are your products safe for babies?",
    answer:
      "Absolutely! All our products meet international safety standards and are tested for quality. We only work with certified brands that prioritize baby safety.",
  },
  {
    question: "How does the Baby Registry work?",
    answer:
      "Create a registry by selecting your favorite products, then share your unique registry link with family and friends. They can purchase items directly from your list, and you'll receive a 15% discount on remaining items after your event.",
  },
  {
    question: "Do you offer gift wrapping?",
    answer:
      "Yes. We can help with gift presentation for eligible orders, and you can contact us for any special gifting notes before dispatch.",
  },
  {
    question: "Can I track my order?",
    answer:
      "Yes, once your order ships, you'll receive a tracking update. You can also review order progress from your dashboard when signed in.",
  },
  {
    question: "Do you have physical store locations?",
    answer:
      "Yes. Nana's Baby Essentials has store locations in Lagos, and the Locations menu shows details, contact information, and opening hours for each branch.",
  },
];

export const REGISTRY_FAQS: FaqItem[] = [
  {
    question: "How do I start a registry?",
    answer:
      "Create your registry, add the items you want, and share your registry link with family and friends. You can keep editing it from your dashboard as your needs change.",
  },
  {
    question: "Can people fund part of a registry item?",
    answer:
      "Yes. Registry gifts can cover full items or partial amounts, depending on the remaining balance on that item and the amount selected at checkout.",
  },
  {
    question: "Can I add gift bundles and swoop packages to my registry?",
    answer:
      "Yes. Special packages can be added to your registry the same way as other registry products, so loved ones can purchase the full package for you.",
  },
  {
    question: "Will I see who has contributed?",
    answer:
      "Yes. Your registry dashboard keeps a payment history so you can review completed gifts, funding activity, and the overall progress of your list.",
  },
  {
    question: "Can I update or remove items after sharing the registry?",
    answer:
      "You can update your registry while it is active. Items that already have gift activity may be protected from removal or quantity reductions below the funded amount.",
  },
  {
    question: "Is there a checklist for planning my registry?",
    answer:
      "Yes. We provide a downloadable registry checklist file that you can keep for planning and reference while building your list.",
  },
  {
    question: "Can I reopen a registry later?",
    answer:
      "Yes. If you close a registry and later want it active again, you can reopen it from your registry dashboard as long as it is still relevant for your planning.",
  },
  {
    question: "How do I share my registry quickly on mobile?",
    answer:
      "Use the Share Registry button inside your registry dashboard or landing page card. It is designed to copy or share your registry link quickly from your phone.",
  },
];
