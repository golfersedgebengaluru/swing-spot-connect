import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useCommunityPosts() {
  return useQuery({
    queryKey: ["community_posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_posts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
      let authorMap = new Map<string, { display_name: string | null }>();
      if (userIds.length) {
        const { data: authors } = await supabase
          .from("public_profiles" as any)
          .select("user_id, display_name")
          .in("user_id", userIds);
        authorMap = new Map(
          ((authors ?? []) as any[]).map((a: any) => [a.user_id, { display_name: a.display_name ?? null }])
        );
      }
      return rows.map((r) => ({
        ...r,
        profiles: authorMap.get(r.user_id) ?? { display_name: null },
      }));
    },
  });
}


export function useCreatePost() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: { content: string; post_type?: string }) => {
      const { data, error } = await supabase
        .from("community_posts")
        .insert({
          user_id: user!.id,
          content: params.content,
          post_type: params.post_type ?? "post",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community_posts"] });
    },
  });
}

export function useLikePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ postId, currentLikes }: { postId: string; currentLikes: number }) => {
      const { error } = await supabase
        .from("community_posts")
        .update({ likes_count: currentLikes + 1 })
        .eq("id", postId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community_posts"] });
    },
  });
}
