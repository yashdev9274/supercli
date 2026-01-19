import Navbar from "@/components/homepage/navbar";
import HeroSection from "@/components/homepage/hero";
import Footer from "@/components/homepage/footer";

export default function Home() {
  return (
    <main className="min-h-screen bg-background dark relative">
      {/* Side borders */}
      <div className="fixed top-0 left-0 w-px h-full bg-border z-50" />
      <div className="fixed top-0 right-0 w-px h-full bg-border z-50" />
      
      <Navbar />
      <HeroSection />
      <Footer />
    </main>
  );
}
