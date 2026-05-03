import Link from "next/link";
import { Baby, Mail, Phone, MapPin } from "lucide-react";
import { FaTiktok, FaWhatsapp } from "react-icons/fa";
import { Separator } from "./ui/separator";
import { LucideProps } from "lucide-react";

const Instagram = (props: LucideProps) => (
  <svg {...props} xmlns="http://w3.org" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
);

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="container mx-auto px-4 py-12">
        <div className="mb-8 grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <Baby className="h-8 w-8 text-pink-500" />
              <h3 className="text-xl font-semibold text-white">Nana&apos;s Baby Essentials</h3>
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
              <li><Link href="/products" className="hover:text-pink-400 transition-colors">All Products</Link></li>
              <li><Link href="/products" className="hover:text-pink-400 transition-colors">Toys</Link></li>
              <li><Link href="/products" className="hover:text-pink-400 transition-colors">Clothing</Link></li>
              <li><Link href="/products" className="hover:text-pink-400 transition-colors">Accessories</Link></li>
              <li><Link href="/products" className="hover:text-pink-400 transition-colors">New Arrivals</Link></li>
              <li><Link href="/products" className="hover:text-pink-400 transition-colors">Best Sellers</Link></li>
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

          <div className="col-span-2 lg:col-span-1">
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

        <div className="text-center text-sm">
          <p>&copy; {currentYear} Nana&apos;s Baby Essentials. All rights reserved. Made with love for Nigerian parents.</p>
        </div>
      </div>
    </footer>
  );
}
