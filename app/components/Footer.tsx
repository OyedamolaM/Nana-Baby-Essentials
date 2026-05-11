import Link from "next/link";
import { Mail, Phone, MapPin } from "lucide-react";
import { FaTiktok, FaWhatsapp } from "react-icons/fa";
import { Separator } from "./ui/separator";
import { LucideProps } from "lucide-react";

const Instagram = (props: LucideProps) => (
  <svg {...props} xmlns="http://w3.org" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
);

type FooterLink = {
  href: string;
  isExternal?: boolean;
  label: string;
};

export function Footer() {
  const currentYear = new Date().getFullYear();
  const savansWhatsappLink =
    "https://wa.me/2348165258326?text=" +
    encodeURIComponent(
      "Hello Savans Technologies, I want to build a website like Nana Baby Essentials."
    );
  const shopLinks: FooterLink[] = [
    { href: "/products", label: "All Products" },
    { href: "/products?category=Toys", label: "Toys" },
    { href: "/products?category=Clothing", label: "Clothing" },
    { href: "/products?category=Accessories", label: "Accessories" },
    { href: "/products?view=new-arrivals", label: "New Arrivals" },
    { href: "/products?featured=1&view=best-sellers", label: "Best Sellers" },
  ];
  const serviceLinks: FooterLink[] = [
    { href: "mailto:nanasbabyessentials@gmail.com", label: "Contact Us", isExternal: true },
    { href: "/shipping-returns-policy#shipping-policy", label: "Shipping Policy" },
    { href: "/shipping-returns-policy#return-policy", label: "Return Policy" },
    { href: "/privacy-policy", label: "Privacy Policy" },
    { href: "/terms-of-service", label: "Terms of Service" },
    { href: "/#faq", label: "FAQ" },
  ];

  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="container mx-auto px-4 py-12">
        <div className="mb-8 grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <img
                src="/logo.jpg"
                alt="Nana's Baby Essentials logo"
                className="h-7 w-7 shrink-0 sm:h-8 sm:w-8"
              />
              <h3 className="text-xl font-semibold tracking-tight text-white">
                <span className="font-serif font-medium italic text-[#b65287]">
                  Nana&apos;s
                </span>{" "}
                Baby Essentials
              </h3>
            </div>
            <p className="text-sm mb-4">
              Your trusted partner for premium baby products in Nigeria. Quality, safety, and love in every product.
            </p>
            <div className="flex gap-4">
              <a href="https://www.instagram.com/nanasbabyessentials" target="_blank" rel="noopener noreferrer" className="hover:text-pink-400 transition-colors">
                <Instagram className="h-5 w-5" />
              </a>
              <a href="https://www.tiktok.com/nanasbabyshop" target="_blank" rel="noopener noreferrer" className="hover:text-pink-400 transition-colors">
                <FaTiktok className="h-5 w-5" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Shop</h4>
            <ul className="space-y-2 text-sm">
              {shopLinks.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="hover:text-pink-400 transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Customer Service</h4>
            <ul className="space-y-2 text-sm">
              {serviceLinks.map((link) => (
                <li key={link.label}>
                  {link.isExternal ? (
                    <a href={link.href} className="hover:text-pink-400 transition-colors">
                      {link.label}
                    </a>
                  ) : (
                    <Link href={link.href} className="hover:text-pink-400 transition-colors">
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div id="contact-info" className="col-span-2 lg:col-span-1">
            <h4 className="text-white font-semibold mb-4">Contact Info</h4>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <MapPin className="h-5 w-5 flex-shrink-0 text-pink-400" />
                <span>Mainland Store - 71 Ogunlana Drive Surulere Lagos</span>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="h-5 w-5 flex-shrink-0 text-pink-400" />
                <span>Island Store - Block A4 Shop 844/845 HFP Eastline Shopping Complex Abraham Adesanya Bustop Ajah</span>
              </li>
              <li className="flex items-center gap-2">
                <a href="https://wa.me/2348024740159" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                  <FaWhatsapp className="h-5 w-5 flex-shrink-0 text-pink-400" />
                  <span>+23408024740159</span>
                </a>
              </li>
              <li className="flex items-center gap-2">
                <a href="tel:+2348024740159" className="flex items-center gap-2">
                <Phone className="h-5 w-5 flex-shrink-0 text-pink-400" />
                <span>+23408024740159</span></a>
              </li>
              <li className="flex items-center gap-2"> 
                <a href="mailto:nanasbabyessentials@gmail.com" className="flex items-center gap-2">
                <Mail className="h-5 w-5 flex-shrink-0 text-pink-400" />
                <span>nanasbabyessentials@gmail.com</span>
                </a>
              </li>
            </ul>
            <div className="text-sm mt-4 flex items-start gap-2">
              <p>
              <strong className="text-white">Hours: </strong>
              </p>
              <p>Mon - Sat: 9:00 AM - 6:00 PM<br />
                 Sunday: Closed
              </p>
            </div>
          </div>
        </div>

        <Separator className="bg-gray-700 mb-8" />

        <div className="space-y-3 text-center text-sm">
          <p>&copy; {currentYear} Nana&apos;s Baby Essentials. All rights reserved. Made with love for Nigerian parents.</p>
          <p className="text-xs text-gray-400 sm:text-sm">
            Powered by{" "}
            <a
              href={savansWhatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-pink-400 transition-colors hover:text-pink-300"
            >
              Savans Technologies
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
