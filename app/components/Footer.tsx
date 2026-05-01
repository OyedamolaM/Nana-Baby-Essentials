import { Baby, Mail, Phone, MapPin, XIcon } from "lucide-react";
import { Separator } from "./ui/separator";
import { LucideProps } from "lucide-react";

const Facebook = (props: LucideProps) => (
  
  <svg {...props} xmlns="http://w3.org" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
);

const Instagram = (props: LucideProps) => (
  <svg {...props} xmlns="http://w3.org" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
);

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Baby className="h-8 w-8 text-pink-500" />
              <h3 className="text-xl font-semibold text-white">Nana&apos;s Baby Essentials</h3>
            </div>
            <p className="text-sm mb-4">
              Your trusted partner for premium baby products in Nigeria. Quality, safety, and love in every product.
            </p>
            <div className="flex gap-4">
              <a href="#" className="hover:text-pink-400 transition-colors">
                <Facebook className="h-5 w-5" />
              </a>
              <a href="#" className="hover:text-pink-400 transition-colors">
                <Instagram className="h-5 w-5" />
              </a>
              <a href="#" className="hover:text-pink-400 transition-colors">
                <XIcon className="h-5 w-5" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Shop</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-pink-400 transition-colors">All Products</a></li>
              <li><a href="#" className="hover:text-pink-400 transition-colors">Toys</a></li>
              <li><a href="#" className="hover:text-pink-400 transition-colors">Clothing</a></li>
              <li><a href="#" className="hover:text-pink-400 transition-colors">Accessories</a></li>
              <li><a href="#" className="hover:text-pink-400 transition-colors">New Arrivals</a></li>
              <li><a href="#" className="hover:text-pink-400 transition-colors">Best Sellers</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Customer Service</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-pink-400 transition-colors">Contact Us</a></li>
              <li><a href="#" className="hover:text-pink-400 transition-colors">Shipping Policy</a></li>
              <li><a href="#" className="hover:text-pink-400 transition-colors">Return Policy</a></li>
              <li><a href="#" className="hover:text-pink-400 transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-pink-400 transition-colors">Terms & Conditions</a></li>
              <li><a href="#" className="hover:text-pink-400 transition-colors">FAQ</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Contact Info</h4>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <MapPin className="h-5 w-5 flex-shrink-0 text-pink-400" />
                <span>Ogunlana Drive, Surulere, Lagos, Nigeria</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-5 w-5 flex-shrink-0 text-pink-400" />
                <span>+234 801 234 5678</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-5 w-5 flex-shrink-0 text-pink-400" />
                <span>hello@babybliss.ng</span>
              </li>
            </ul>
            <p className="text-sm mt-4">
              <strong className="text-white">Hours:</strong><br />
              Mon - Sat: 9:00 AM - 6:00 PM<br />
              Sunday: Closed
            </p>
          </div>
        </div>

        <Separator className="bg-gray-700 mb-8" />

        <div className="text-center text-sm">
          <p>&copy; {currentYear} Nana&apos;s Baby Essentials. All rights reserved. Made with love for Nigerian parents.</p>
        </div>
      </div>
    </footer>
  );
}
