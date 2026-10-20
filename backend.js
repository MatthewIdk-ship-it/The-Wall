(() => {
  const config = window.THE_WALL_CONFIG || {};
  const library = window.supabase;
  const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey && library?.createClient);
  const client = configured
    ? library.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
    })
    : null;

  const requireClient = () => {
    if (!client) throw new Error("Supabase nu este configurat încă. Completează config.js și aplică supabase/schema.sql.");
    return client;
  };

  const normalizeHandle = (handle) => {
    const normalized = handle.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(normalized)) throw new Error("Invalid username");
    return normalized;
  };

  window.wallBackend = {
    configured,
    client,
    async getSession() {
      if (!client) return null;
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data.session;
    },
    onAuthChange(callback) {
      if (!client) return () => {};
      const { data } = client.auth.onAuthStateChange((event, session) => callback(session, event));
      return () => data.subscription.unsubscribe();
    },
    async signUp({ email, password, name, handle }) {
      const api = requireClient();
      const normalizedHandle = normalizeHandle(handle);
      const { data, error } = await api.auth.signUp({
        email,
        password,
        options: { data: { display_name: name, handle: normalizedHandle } }
      });
      if (error) throw error;
      return data;
    },
    async signIn({ email, password }) {
      const { data, error } = await requireClient().auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },
    async signOut() {
      const { error } = await requireClient().auth.signOut();
      if (error) throw error;
    },
    async sendPasswordReset(email) {
      const redirectTo = window.location.href.split(/[?#]/, 1)[0];
      const { error } = await requireClient().auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
    },
    async getProfile(userId) {
      const { data, error } = await requireClient().from("profiles").select("id, display_name, handle, avatar_url").eq("id", userId).single();
      if (error) throw error;
      return data;
    },
    async updateProfile({ userId, name, handle, image, updateHandle = false }) {
      const api = requireClient();
      const normalizedHandle = normalizeHandle(handle);
      let avatarUrl = null;
      let uploadedPath = null;
      if (image) {
        const extension = image.name.split(".").pop().toLowerCase();
        uploadedPath = `${userId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await api.storage.from("post-images").upload(uploadedPath, image, { contentType: image.type, upsert: false });
        if (uploadError) throw uploadError;
        avatarUrl = api.storage.from("post-images").getPublicUrl(uploadedPath).data.publicUrl;
      }
      const updates = { display_name: name };
      if (updateHandle) updates.handle = normalizedHandle;
      if (avatarUrl) updates.avatar_url = avatarUrl;
      const { error } = await api.from("profiles").update(updates).eq("id", userId);
      if (error) {
        if (uploadedPath) {
          const { error: cleanupError } = await api.storage.from("post-images").remove([uploadedPath]);
          if (cleanupError) console.error("Unable to clean up the uploaded profile image.", cleanupError);
        }
        throw error;
      }
      return avatarUrl;
    },
    async getPosts({ followingOnly = false } = {}) {
      const api = requireClient();
      let query = api.from("posts").select("id, author_id, body, image_url, created_at, profiles:profiles!posts_author_id_fkey(id, display_name, handle, avatar_url), comments(id, body, created_at, profiles:profiles!comments_author_id_fkey(id, display_name, handle)), post_likes(user_id)").order("created_at", { ascending: false }).limit(50);
      if (followingOnly) {
        const { data: authData, error: authError } = await api.auth.getUser();
        if (authError) throw authError;
        if (!authData.user) return [];
        const { data: follows, error: followError } = await api.from("follows").select("followed_id").eq("follower_id", authData.user.id);
        if (followError) throw followError;
        const ids = follows.map((follow) => follow.followed_id);
        if (!ids.length) return [];
        query = query.in("author_id", ids);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    async getStories() {
      const { data, error } = await requireClient().from("stories")
        .select("id, author_id, body, image_url, created_at, expires_at, profiles:profiles!stories_author_id_fkey(id, display_name, handle, avatar_url)")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    async publishStory({ body, image }) {
      const api = requireClient();
      const { data: authData, error: authError } = await api.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error("Conectează-te înainte să publici o poveste.");
      let imageUrl = null;
      let uploadedPath = null;
      if (image) {
        const extension = image.name.split(".").pop().toLowerCase();
        uploadedPath = `${authData.user.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await api.storage.from("post-images").upload(uploadedPath, image, { contentType: image.type, upsert: false });
        if (uploadError) throw uploadError;
        imageUrl = api.storage.from("post-images").getPublicUrl(uploadedPath).data.publicUrl;
      }
      const { data, error } = await api.from("stories").insert({
        author_id: authData.user.id,
        body,
        image_url: imageUrl
      }).select().single();
      if (error) {
        if (uploadedPath) {
          const { error: cleanupError } = await api.storage.from("post-images").remove([uploadedPath]);
          if (cleanupError) console.error("Unable to clean up the uploaded story image.", cleanupError);
        }
        throw error;
      }
      return data;
    },
    async publishPost({ body, image }) {
      const api = requireClient();
      const { data: authData, error: authError } = await api.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error("Trebuie să te conectezi înainte să publici.");
      let imageUrl = null;
      let uploadedPath = null;
      if (image) {
        const extension = image.name.split(".").pop().toLowerCase();
        uploadedPath = `${authData.user.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await api.storage.from("post-images").upload(uploadedPath, image, { contentType: image.type, upsert: false });
        if (uploadError) throw uploadError;
        imageUrl = api.storage.from("post-images").getPublicUrl(uploadedPath).data.publicUrl;
      }
      const { data, error } = await api.from("posts").insert({ author_id: authData.user.id, body, image_url: imageUrl }).select().single();
      if (error) {
        if (uploadedPath) await api.storage.from("post-images").remove([uploadedPath]);
        throw error;
      }
      return data;
    },
    async toggleLike(postId, liked) {
      const api = requireClient();
      const { data: authData, error: authError } = await api.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error("Conectează-te pentru a aprecia postările.");
      const result = liked
        ? await api.from("post_likes").insert({ post_id: postId, user_id: authData.user.id })
        : await api.from("post_likes").delete().eq("post_id", postId).eq("user_id", authData.user.id);
      if (result.error && !(liked && result.error.code === "23505")) throw result.error;
    },
    async toggleSave(postId, saved) {
      const api = requireClient();
      const { data: authData, error: authError } = await api.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error("Conectează-te pentru a salva postări.");
      const result = saved
        ? await api.from("saved_posts").insert({ post_id: postId, user_id: authData.user.id })
        : await api.from("saved_posts").delete().eq("post_id", postId).eq("user_id", authData.user.id);
      if (result.error && !(saved && result.error.code === "23505")) throw result.error;
    },
    async getSavedIds() {
      const api = requireClient();
      const { data: authData, error: authError } = await api.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) return [];
      const { data, error } = await api.from("saved_posts").select("post_id").eq("user_id", authData.user.id);
      if (error) throw error;
      return data.map((entry) => entry.post_id);
    },
    async getLikedIds() {
      const api = requireClient();
      const { data: authData, error: authError } = await api.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) return [];
      const { data, error } = await api.from("post_likes").select("post_id").eq("user_id", authData.user.id);
      if (error) throw error;
      return data.map((entry) => entry.post_id);
    },
    async addComment(postId, body) {
      const api = requireClient();
      const { data: authData, error: authError } = await api.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error("Conectează-te pentru a comenta.");
      const { error } = await api.from("comments").insert({ post_id: postId, author_id: authData.user.id, body });
      if (error) throw error;
    },
    async toggleFollow(userId, following) {
      const api = requireClient();
      const { data: authData, error: authError } = await api.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error("Conectează-te pentru a te abona la persoane.");
      const result = following
        ? await api.from("follows").insert({ follower_id: authData.user.id, followed_id: userId })
        : await api.from("follows").delete().eq("follower_id", authData.user.id).eq("followed_id", userId);
      if (result.error && !(following && result.error.code === "23505")) throw result.error;
    },
    async getFollowedIds() {
      const api = requireClient();
      const { data: authData, error: authError } = await api.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) return [];
      const { data, error } = await api.from("follows").select("followed_id").eq("follower_id", authData.user.id);
      if (error) throw error;
      return data.map((entry) => entry.followed_id);
    },
    async getFollowingProfiles() {
      const api = requireClient();
      const { data: authData, error: authError } = await api.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) return [];
      const { data, error } = await api.from("follows")
        .select("followed:profiles!follows_followed_id_fkey(id, display_name, handle, avatar_url)")
        .eq("follower_id", authData.user.id);
      if (error) throw error;
      return data.map((row) => row.followed);
    },
    async searchProfiles(value) {
      const { data, error } = await requireClient().from("profiles").select("id, display_name, handle, avatar_url").ilike("handle", `%${value.replace(/^@/, "")}%`).limit(10);
      if (error) throw error;
      return data;
    },
    async addFriendByHandle(handle) {
      const api = requireClient();
      const { data: authData, error: authError } = await api.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error("Conectează-te pentru a adăuga prieteni.");
      const { data: profile, error } = await api.from("profiles").select("id").eq("handle", handle.replace(/^@/, "").toLowerCase()).single();
      if (error) throw error;
      if (profile.id === authData.user.id) throw new Error("Nu te poți adăuga pe tine.");
      const { error: followError } = await api.from("follows").insert({ follower_id: authData.user.id, followed_id: profile.id });
      if (followError && followError.code !== "23505") throw followError;
    },
    async getNotifications() {
      const api = requireClient();
      const { data: authData, error: authError } = await api.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) return [];
      const { data, error } = await api.from("notifications").select("id, type, post_id, created_at, read, actor:profiles!notifications_actor_id_fkey(display_name, handle, avatar_url)").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
    async markNotificationsRead() {
      const api = requireClient();
      const { data: authData, error: authError } = await api.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) return;
      const { error } = await api.from("notifications").update({ read: true }).eq("user_id", authData.user.id).eq("read", false);
      if (error) throw error;
    },
    subscribeNotifications(userId, callback) {
      const api = requireClient();
      const channel = api.channel(`notifications:${userId}`).on("postgres_changes", {
        event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}`
      }, callback).subscribe();
      return () => api.removeChannel(channel);
    }
  };
})();
