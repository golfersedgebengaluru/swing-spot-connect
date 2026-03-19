import { useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Heart, MessageCircle, Share2, Image, Trophy, Loader2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCommunityPosts, useCreatePost, useLikePost } from "@/hooks/useCommunity";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow } from "date-fns";

const POST_TYPE_COLORS: Record<string, string> = {
  achievement: "bg-accent/10 text-accent",
  tip: "bg-blue-500/10 text-blue-600",
  event: "bg-green-500/10 text-green-600",
  post: "",
};

function PostSkeleton() {
  return (
    <Card className="shadow-elegant">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2 space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </CardContent>
    </Card>
  );
}

export default function Community() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: posts, isLoading } = useCommunityPosts();
  const createPost = useCreatePost();
  const likePost = useLikePost();
  const [newPost, setNewPost] = useState("");
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());

  const handlePost = async () => {
    if (!newPost.trim()) return;
    try {
      await createPost.mutateAsync({ content: newPost.trim() });
      setNewPost("");
      toast({ title: "Post shared!" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleLike = async (postId: string, currentLikes: number) => {
    if (likedPosts.has(postId)) return;
    setLikedPosts((prev) => new Set(prev).add(postId));
    try {
      await likePost.mutateAsync({ postId, currentLikes });
    } catch {
      setLikedPosts((prev) => { const n = new Set(prev); n.delete(postId); return n; });
    }
  };

  const userInitials = user?.email?.slice(0, 2).toUpperCase() ?? "YO";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />

      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl">
            {/* Header */}
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h1 className="font-display text-3xl font-bold text-foreground">Community</h1>
                <p className="mt-1 text-muted-foreground">Connect with fellow golf enthusiasts</p>
              </div>
            </div>

            {/* New Post */}
            <Card className="mb-6 shadow-elegant">
              <CardContent className="p-4">
                <div className="flex gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <span className="text-sm font-medium text-primary">{userInitials}</span>
                  </div>
                  <div className="flex-1">
                    <Textarea
                      placeholder="Share your achievements, tips, or thoughts..."
                      value={newPost}
                      onChange={(e) => setNewPost(e.target.value)}
                      className="min-h-[80px] resize-none border-0 p-0 focus-visible:ring-0"
                    />
                    <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" disabled>
                          <Image className="mr-2 h-4 w-4" />
                          Photo
                        </Button>
                        <Button variant="ghost" size="sm" disabled>
                          <Trophy className="mr-2 h-4 w-4" />
                          Achievement
                        </Button>
                      </div>
                      <Button size="sm" disabled={!newPost.trim() || createPost.isPending} onClick={handlePost}>
                        {createPost.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Posts Feed */}
            <div className="space-y-4">
              {isLoading && (
                <>
                  <PostSkeleton />
                  <PostSkeleton />
                  <PostSkeleton />
                </>
              )}

              {!isLoading && (posts ?? []).length === 0 && (
                <Card className="shadow-elegant">
                  <CardContent className="py-16 text-center">
                    <Users className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                    <p className="font-medium text-foreground">No posts yet</p>
                    <p className="text-sm text-muted-foreground">Be the first to share something with the community!</p>
                  </CardContent>
                </Card>
              )}

              {(posts ?? []).map((post: any) => {
                const authorName = post.profiles?.display_name || "Member";
                const initials = authorName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
                const isLiked = likedPosts.has(post.id);
                const typeColor = POST_TYPE_COLORS[post.post_type] ?? "";

                return (
                  <Card key={post.id} className="shadow-elegant transition-all hover:shadow-lg">
                    <CardHeader className="p-4 pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                            <span className="text-sm font-medium text-primary">{initials}</span>
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{authorName}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                        {post.post_type !== "post" && (
                          <Badge variant="outline" className={typeColor}>
                            {post.post_type}
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-2">
                      <p className="text-foreground whitespace-pre-wrap">{post.content}</p>
                      <div className="mt-4 flex items-center gap-4 border-t border-border pt-4">
                        <button
                          className={`flex items-center gap-2 transition-colors ${isLiked ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
                          onClick={() => handleLike(post.id, post.likes_count)}
                          disabled={isLiked}
                        >
                          <Heart className={`h-4 w-4 ${isLiked ? "fill-current" : ""}`} />
                          <span className="text-sm">{post.likes_count + (isLiked ? 0 : 0)}</span>
                        </button>
                        <button className="flex items-center gap-2 text-muted-foreground">
                          <MessageCircle className="h-4 w-4" />
                          <span className="text-sm">0</span>
                        </button>
                        <button className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors">
                          <Share2 className="h-4 w-4" />
                          <span className="text-sm">Share</span>
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
