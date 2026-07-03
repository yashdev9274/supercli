import Navbar from "@/components/homepage/navbar";
import HeroSection from "@/components/homepage/hero";
import GetStartedSection from "@/components/homepage/get-started";
import PartnershipsSection from "@/components/homepage/partnerships-section";
import Footer from "@/components/homepage/footer";

export default async function Home() {
  return (
    <main className="min-h-screen bg-background dark relative">
      {/* Side borders */}
      <div className="fixed top-0 left-0 w-px h-full bg-border z-50" />
      <div className="fixed top-0 right-0 w-px h-full bg-border z-50" />
      
      <Navbar />
      <HeroSection />

      <GetStartedSection />

      <PartnershipsSection />
      <Footer />
    </main>
  );
}
