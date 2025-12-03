import { useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Heart, MessageCircle, Share2, Image, Trophy, Target } from "lucide-react";
import { cn } from "@/lib/utils";

const posts = [
  {
    id: 1,
    author: "Michael Chen",
    avatar: "MC",
    time: "2 hours ago",
    content: "Finally broke 80 today! 🎉 After months of practice, shot a 78 on the Pebble Beach simulation. The back nine was intense!",
    likes: 24,
    comments: 8,
    type: "achievement",
    achievement: "Shot under 80",
  },
  {
    id: 2,
    author: "Sarah Williams",
    avatar: "SW",
    time: "5 hours ago",
    content: "Great turnout at the weekend tournament! Congrats to all the winners. See everyone at the Holiday Cup! 🏆",
    image: true,
    likes: 42,
    comments: 15,
    type: "event",
  },
  {
    id: 3,
    author: "David Kim",
    avatar: "DK",
    time: "Yesterday",
    content: "Tip for anyone struggling with their driver: Focus on your grip pressure. I was squeezing way too tight. Loosened up and added 15 yards instantly!",
    likes: 38,
    comments: 12,
    type: "tip",
  },
  {
    id: 4,
    author: "Jennifer Lee",
    avatar: "JL",
    time: "Yesterday",
    content: "Looking for practice partners! Usually here Tuesday and Thursday evenings. Drop a comment if you want to work on your short game together! ⛳",
    likes: 18,
    comments: 6,
    type: "post",
  },
  {
    id: 5,
    author: "Robert Wilson",
    avatar: "RW",
    time: "2 days ago",
    content: "Just hit my first hole-in-one on the simulator! Bay 3, 165 yards, 7-iron. I'm still shaking! 🕳️⛳",
    likes: 89,
    comments: 34,
    type: "achievement",
    achievement: "Hole in One",
  },
];

export default function Community() {
  const [newPost, setNewPost] = useState("");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar isAuthenticated={true} />
      
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl">
            {/* Header */}
            <div className="mb-8">
              <h1 className="font-display text-3xl font-bold text-foreground">
                Community
              </h1>
              <p className="mt-1 text-muted-foreground">
                Connect with fellow golf enthusiasts
              </p>
            </div>

            {/* New Post */}
            <Card className="mb-6 shadow-elegant">
              <CardContent className="p-4">
                <div className="flex gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <span className="text-sm font-medium text-primary">YO</span>
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
                        <Button variant="ghost" size="sm">
                          <Image className="mr-2 h-4 w-4" />
                          Photo
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Trophy className="mr-2 h-4 w-4" />
                          Achievement
                        </Button>
                      </div>
                      <Button size="sm" disabled={!newPost.trim()}>
                        Post
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Posts Feed */}
            <div className="space-y-4">
              {posts.map((post) => (
                <Card key={post.id} className="shadow-elegant transition-all hover:shadow-lg">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                          <span className="text-sm font-medium text-primary">
                            {post.avatar}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{post.author}</p>
                          <p className="text-xs text-muted-foreground">{post.time}</p>
                        </div>
                      </div>
                      {post.achievement && (
                        <div className="flex items-center gap-1 rounded-full bg-accent/10 px-3 py-1">
                          <Target className="h-3 w-3 text-accent" />
                          <span className="text-xs font-medium text-accent">
                            {post.achievement}
                          </span>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-2">
                    <p className="text-foreground">{post.content}</p>
                    
                    {post.image && (
                      <div className="mt-3 h-48 overflow-hidden rounded-lg bg-muted">
                        <div className="flex h-full items-center justify-center text-muted-foreground">
                          Event Photo
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="mt-4 flex items-center gap-4 border-t border-border pt-4">
                      <button className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-primary">
                        <Heart className="h-4 w-4" />
                        <span className="text-sm">{post.likes}</span>
                      </button>
                      <button className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-primary">
                        <MessageCircle className="h-4 w-4" />
                        <span className="text-sm">{post.comments}</span>
                      </button>
                      <button className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-primary">
                        <Share2 className="h-4 w-4" />
                        <span className="text-sm">Share</span>
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Load More */}
            <div className="mt-8 text-center">
              <Button variant="outline">Load More Posts</Button>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
