import { useParams } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { usePageContent } from "@/hooks/usePageContent";
import { Loader2 } from "lucide-react";

export default function PageView() {
  const { slug } = useParams<{ slug: string }>();
  const { data: page, isLoading, error } = usePageContent(slug);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1 py-12">
        <div className="container mx-auto max-w-3xl px-4">
          {isLoading ? (
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
          ) : error || !page ? (
            <div className="text-center">
              <h1 className="font-display text-2xl font-bold text-foreground">Page not found</h1>
              <p className="mt-2 text-muted-foreground">The page you're looking for doesn't exist.</p>
            </div>
          ) : (
            <>
              <h1 className="font-display text-3xl font-bold text-foreground mb-6">{page.title}</h1>
              <div
                className="prose prose-neutral dark:prose-invert max-w-none text-muted-foreground leading-normal prose-headings:font-display prose-headings:text-foreground prose-strong:text-foreground prose-blockquote:border-border prose-blockquote:text-muted-foreground prose-li:text-foreground prose-p:leading-normal prose-p:whitespace-pre-wrap prose-li:leading-normal [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_p:empty]:min-h-[1em] [&_p:empty]:my-0"
                dangerouslySetInnerHTML={{ __html: page.content }}
              />
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
