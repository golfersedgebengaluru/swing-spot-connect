import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AppleProfileCompletionModal } from "@/components/AppleProfileCompletionModal";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  profileIncomplete: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  profileIncomplete: false,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

interface ProfileCheck {
  needed: boolean;
  displayName: string;
  email: string;
}

function isRelayEmail(email: string | null | undefined): boolean {
  return !!email && email.includes("privaterelay.appleid.com");
}

async function checkAppleProfile(user: User): Promise<ProfileCheck> {
  // Only check for Apple provider users
  const isApple = user.app_metadata?.provider === "apple" ||
    user.identities?.some((i) => i.provider === "apple");

  if (!isApple) return { needed: false, displayName: "", email: "" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("user_id", user.id)
    .single();

  if (!profile) return { needed: false, displayName: "", email: "" };

  const nameOk = !!profile.display_name && profile.display_name.trim().length > 0;
  const emailOk = !!profile.email && !isRelayEmail(profile.email);

  return {
    needed: !nameOk || !emailOk,
    displayName: profile.display_name || "",
    email: profile.email || "",
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileCheck, setProfileCheck] = useState<ProfileCheck>({
    needed: false,
    displayName: "",
    email: "",
  });

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        if (session?.user) {
          const check = await checkAppleProfile(session.user);
          setProfileCheck(check);
        } else {
          setProfileCheck({ needed: false, displayName: "", email: "" });
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      if (session?.user) {
        const check = await checkAppleProfile(session.user);
        setProfileCheck(check);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ user, session, loading, profileIncomplete: profileCheck.needed, signOut }}
    >
      {children}
      {user && profileCheck.needed && (
        <AppleProfileCompletionModal
          open={true}
          userId={user.id}
          currentName={profileCheck.displayName}
          currentEmail={profileCheck.email}
        />
      )}
    </AuthContext.Provider>
  );
}
