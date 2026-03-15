import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function usePageContent(slug?: string) {
  return useQuery({
    queryKey: ["page_content", slug],
    queryFn: async () => {
      if (!slug) return null;
      const { data, error } = await supabase
        .from("page_content" as any)
        .select("*")
        .eq("slug", slug)
        .single();
      if (error) throw error;
      return data as { id: string; slug: string; title: string; content: string; updated_at: string };
    },
    enabled: !!slug,
  });
}

export function useAllPageContent() {
  return useQuery({
    queryKey: ["page_content"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("page_content" as any)
        .select("*")
        .order("slug");
      if (error) throw error;
      return data as { id: string; slug: string; title: string; content: string; updated_at: string }[];
    },
  });
}

export function useUpdatePageContent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, title, content }: { id: string; title: string; content: string }) => {
      const { error } = await supabase
        .from("page_content" as any)
        .update({ title, content, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["page_content"] });
    },
  });
}
