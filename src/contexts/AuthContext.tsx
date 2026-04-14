import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AppleProfileCompletionModal } from "@/components/AppleProfileCompletionModal";
import { PhoneCompletionModal } from "@/components/PhoneCompletionModal";

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

async function checkPhoneMissing(user: User): Promise<boolean> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("phone")
    .eq("user_id", user.id)
    .single();

  return !profile?.phone || profile.phone.trim().length === 0;
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
  const [phoneMissing, setPhoneMissing] = useState(false);
  const phoneCheckedRef = useRef<string | null>(null);
  const autoGiftFiredRef = useRef<Set<string>>(new Set());
  const hadSessionRef = useRef(false);

  useEffect(() => {
    // Get the initial session first so we know if this is a restore
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (initialSession?.user) {
        hadSessionRef.current = true;
      }
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      setLoading(false);

      if (!initialSession?.user) {
        setProfileCheck({ needed: false, displayName: "", email: "" });
        setPhoneMissing(false);
        phoneCheckedRef.current = null;
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        setLoading(false);

        // Only fire auto-gifts on a genuine fresh sign-in, not session restores
        if (
          event === "SIGNED_IN" &&
          nextSession?.user &&
          !hadSessionRef.current &&
          !autoGiftFiredRef.current.has(nextSession.user.id)
        ) {
          autoGiftFiredRef.current.add(nextSession.user.id);
          supabase.functions.invoke("process-auto-gifts", {
            body: { user_id: nextSession.user.id, trigger_event: "signup" },
          }).catch((err) => console.error("Auto-gift error:", err));
        }

        // After first SIGNED_IN event, mark that we have a session
        if (event === "SIGNED_IN") {
          hadSessionRef.current = true;
        }

        if (!nextSession?.user) {
          setProfileCheck({ needed: false, displayName: "", email: "" });
          setPhoneMissing(false);
          phoneCheckedRef.current = null;
          hadSessionRef.current = false;
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const runProfileChecks = async () => {
      const check = await checkAppleProfile(user);
      if (cancelled) return;

      setProfileCheck(check);

      if (check.needed) {
        setPhoneMissing(false);
        return;
      }

      if (phoneCheckedRef.current === user.id) return;
      phoneCheckedRef.current = user.id;

      const noPhone = await checkPhoneMissing(user);
      if (!cancelled) {
        setPhoneMissing(noPhone);
      }
    };

    void runProfileChecks();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const signOut = async () => {
    setProfileCheck({ needed: false, displayName: "", email: "" });
    setPhoneMissing(false);
    phoneCheckedRef.current = null;
    await supabase.auth.signOut();
  };

  const handlePhoneComplete = () => {
    setPhoneMissing(false);
  };

  // Show Apple profile modal first, then phone modal
  const showAppleModal = user && profileCheck.needed;
  const showPhoneModal = user && !profileCheck.needed && phoneMissing;

  return (
    <AuthContext.Provider
      value={{ user, session, loading, profileIncomplete: profileCheck.needed || phoneMissing, signOut }}
    >
      {children}
      {showAppleModal && (
        <AppleProfileCompletionModal
          open={true}
          userId={user.id}
          currentName={profileCheck.displayName}
          currentEmail={profileCheck.email}
        />
      )}
      {showPhoneModal && (
        <PhoneCompletionModal
          open={true}
          userId={user.id}
          onComplete={handlePhoneComplete}
        />
      )}
    </AuthContext.Provider>
  );
}
