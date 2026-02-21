import React, { useEffect, useMemo, useState } from 'react';

type Tab = 'home' | 'calendar' | 'songs' | 'notifications' | 'profile';

type User = {
  id: string;
  email: string;
  password: string;
  age: number;
  nickname: string;
};

type FeedPost = {
  id: string;
  authorId: string;
  text: string;
  image?: string;
  createdAt: string;
  expiresAt: string;
  source?: 'post' | 'live_announcement';
};

type LiveEvent = {
  id: string;
  title: string;
  description: string;
  scheduledAt: string;
  createdBy: string;
};

type Alert = {
  id: string;
  type: 'admin' | 'user';
  message: string;
  createdAt: string;
};

type ChatMessage = { senderId: string; text: string; sentAt: string };
type ChatThread = { id: string; users: string[]; messages: ChatMessage[] };

const STORAGE_KEY = 'korusagi-app-state-v1';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const BAD_WORDS = ['idiota', 'burro', 'otario', 'palhaco', 'merda', 'lixo', 'fuck', 'shit'];

type PersistedState = {
  users: User[];
  posts: FeedPost[];
  events: LiveEvent[];
  notifications: Alert[];
  chats: ChatThread[];
};

const defaultSongs = [
  { title: 'Korusagi - Night Pulse', duration: '3:24' },
  { title: 'Korusagi - Neon Whisper', duration: '4:01' },
  { title: 'Korusagi - Deep Signal', duration: '2:58' },
  { title: 'Korusagi - Shadow Bloom', duration: '3:47' },
];

const App: React.FC = () => {
  const [state, setState] = useState<PersistedState>({ users: [], posts: [], events: [], notifications: [], chats: [] });
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [search, setSearch] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [age, setAge] = useState('');
  const [nickname, setNickname] = useState('');

  const [postText, setPostText] = useState('');
  const [postImage, setPostImage] = useState<string | undefined>(undefined);

  const [liveTitle, setLiveTitle] = useState('');
  const [liveDesc, setLiveDesc] = useState('');
  const [liveDate, setLiveDate] = useState('');

  const [chatTarget, setChatTarget] = useState('');
  const [chatText, setChatText] = useState('');

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as PersistedState;
      setState(parsed);
    } catch {
      // keep defaults
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    setState(prev => ({ ...prev, posts: prev.posts.filter(p => new Date(p.expiresAt).getTime() > Date.now()) }));
  }, []);

  const currentUser = useMemo(() => state.users.find(u => u.id === currentUserId) || null, [state.users, currentUserId]);

  const usersById = useMemo(() => Object.fromEntries(state.users.map(u => [u.id, u])), [state.users]);

  const filteredPosts = useMemo(() => {
    const q = search.toLowerCase().trim();
    const ordered = [...state.posts].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    if (!q) return ordered;
    return ordered.filter(post => {
      const author = usersById[post.authorId]?.nickname ?? '';
      return [post.text, author].join(' ').toLowerCase().includes(q);
    });
  }, [search, state.posts, usersById]);

  const filteredEvents = useMemo(() => {
    const q = search.toLowerCase().trim();
    const ordered = [...state.events].sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
    if (!q) return ordered;
    return ordered.filter(e => `${e.title} ${e.description}`.toLowerCase().includes(q));
  }, [search, state.events]);

  const filteredSongs = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return defaultSongs;
    return defaultSongs.filter(s => s.title.toLowerCase().includes(q));
  }, [search]);

  const userNotifications = useMemo(() => {
    const q = search.toLowerCase().trim();
    const base = [...state.notifications].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    if (!q) return base;
    return base.filter(n => n.message.toLowerCase().includes(q));
  }, [search, state.notifications]);

  const validateText = (text: string, offenderId: string) => {
    const normalized = text.toLowerCase();
    const found = BAD_WORDS.find(word => normalized.includes(word));
    if (!found) return { ok: true, cleanText: text };

    setState(prev => ({
      ...prev,
      notifications: [
        {
          id: crypto.randomUUID(),
          type: 'admin',
          createdAt: new Date().toISOString(),
          message: `Alerta ao admin: conteúdo ofensivo detectado de ${usersById[offenderId]?.nickname || offenderId}. Palavra bloqueada: "${found}".`,
        },
        {
          id: crypto.randomUUID(),
          type: 'user',
          createdAt: new Date().toISOString(),
          message: 'Seu conteúdo foi ocultado por linguagem imprópria e notificado ao administrador.',
        },
        ...prev.notifications,
      ],
    }));

    return { ok: false, cleanText: '[Conteúdo ocultado por moderação automática]' };
  };

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (isRegisterMode) {
      if (!email || !password || !age || !nickname) return;
      if (state.users.some(u => u.email === email)) return alert('Email já cadastrado.');
      const user: User = { id: crypto.randomUUID(), email, password, age: Number(age), nickname };
      setState(prev => ({ ...prev, users: [...prev.users, user] }));
      setCurrentUserId(user.id);
      return;
    }

    const found = state.users.find(u => u.email === email && u.password === password);
    if (!found) return alert('Login inválido.');
    setCurrentUserId(found.id);
  };

  const handleCreatePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !postText.trim()) return;
    const moderation = validateText(postText, currentUser.id);

    const post: FeedPost = {
      id: crypto.randomUUID(),
      authorId: currentUser.id,
      text: moderation.cleanText,
      image: moderation.ok ? postImage : undefined,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + WEEK_MS).toISOString(),
      source: 'post',
    };

    setState(prev => ({ ...prev, posts: [post, ...prev.posts] }));
    setPostText('');
    setPostImage(undefined);
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPostImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleCreateLive = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !liveTitle || !liveDate) return;

    const eventData: LiveEvent = {
      id: crypto.randomUUID(),
      title: liveTitle,
      description: liveDesc,
      scheduledAt: new Date(liveDate).toISOString(),
      createdBy: currentUser.id,
    };

    const announcementDate = new Date(new Date(eventData.scheduledAt).getTime() - DAY_MS);
    const liveAnnouncement: FeedPost = {
      id: crypto.randomUUID(),
      authorId: currentUser.id,
      text: `🔴 Live agendada para amanhã: ${liveTitle} (${new Date(eventData.scheduledAt).toLocaleString('pt-BR')}).`,
      createdAt: announcementDate.toISOString(),
      expiresAt: new Date(announcementDate.getTime() + WEEK_MS).toISOString(),
      source: 'live_announcement',
    };

    setState(prev => ({ ...prev, events: [...prev.events, eventData], posts: [liveAnnouncement, ...prev.posts] }));
    setLiveTitle('');
    setLiveDesc('');
    setLiveDate('');
  };

  const startOrGetThread = () => {
    if (!currentUser || !chatTarget || chatTarget === currentUser.id) return null;
    const existing = state.chats.find(t => t.users.includes(currentUser.id) && t.users.includes(chatTarget));
    if (existing) return existing.id;
    const thread: ChatThread = { id: crypto.randomUUID(), users: [currentUser.id, chatTarget], messages: [] };
    setState(prev => ({ ...prev, chats: [thread, ...prev.chats] }));
    return thread.id;
  };

  const activeThread = useMemo(() => {
    if (!currentUser || !chatTarget) return null;
    return state.chats.find(t => t.users.includes(currentUser.id) && t.users.includes(chatTarget)) || null;
  }, [state.chats, chatTarget, currentUser]);

  const sendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !chatText.trim()) return;
    const moderation = validateText(chatText, currentUser.id);
    const threadId = startOrGetThread();
    if (!threadId) return;

    setState(prev => ({
      ...prev,
      chats: prev.chats.map(thread =>
        thread.id === threadId
          ? {
              ...thread,
              messages: [...thread.messages, { senderId: currentUser.id, text: moderation.cleanText, sentAt: new Date().toISOString() }],
            }
          : thread,
      ),
    }));
    setChatText('');
  };

  if (!currentUser) {
    return (
      <main className="app-shell auth-shell">
        <section className="glass card auth-card">
          <h1>Korusagi • Community Hub</h1>
          <p>Site do canal para fãs no PC e no mobile.</p>
          <form onSubmit={handleAuth} className="stack">
            <input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            <input placeholder="Senha" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            {isRegisterMode && (
              <>
                <input placeholder="Idade" type="number" min={13} value={age} onChange={e => setAge(e.target.value)} required />
                <input placeholder="Nick name" value={nickname} onChange={e => setNickname(e.target.value)} required />
              </>
            )}
            <button type="submit">{isRegisterMode ? 'Criar conta' : 'Entrar'}</button>
          </form>
          <button className="link-btn" onClick={() => setIsRegisterMode(v => !v)}>
            {isRegisterMode ? 'Já tenho conta' : 'Criar cadastro'}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="glass topbar">
        <strong>Korusagi</strong>
        <input placeholder="Pesquisar no site inteiro por palavra-chave" value={search} onChange={e => setSearch(e.target.value)} />
        <span>@{currentUser.nickname}</span>
      </header>

      <nav className="glass tabs">
        {[
          ['home', 'Home / Feed'],
          ['calendar', 'Calendário de Lives'],
          ['songs', 'Songs'],
          ['notifications', 'Notificações'],
          ['profile', 'Perfil'],
        ].map(([id, label]) => (
          <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id as Tab)}>
            {label}
          </button>
        ))}
      </nav>

      {activeTab === 'home' && (
        <section className="grid">
          <article className="glass card">
            <h2>Novo post</h2>
            <form className="stack" onSubmit={handleCreatePost}>
              <textarea placeholder="Compartilhe novidades do canal..." value={postText} onChange={e => setPostText(e.target.value)} />
              <input type="file" accept="image/*" onChange={handleImageUpload} />
              <button type="submit">Publicar (expira em 7 dias)</button>
            </form>
          </article>

          <article className="glass card">
            <h2>Feed</h2>
            {filteredPosts.map(post => (
              <div key={post.id} className="post">
                <small>
                  @{usersById[post.authorId]?.nickname} • {new Date(post.createdAt).toLocaleString('pt-BR')} {post.source === 'live_announcement' ? '• aviso live' : ''}
                </small>
                <p>{post.text}</p>
                {post.image && <img src={post.image} alt="Imagem do post" />}
              </div>
            ))}
          </article>
        </section>
      )}

      {activeTab === 'calendar' && (
        <section className="grid">
          <article className="glass card">
            <h2>Registrar Live</h2>
            <form className="stack" onSubmit={handleCreateLive}>
              <input placeholder="Título da live" value={liveTitle} onChange={e => setLiveTitle(e.target.value)} />
              <textarea placeholder="Descrição" value={liveDesc} onChange={e => setLiveDesc(e.target.value)} />
              <input type="datetime-local" value={liveDate} onChange={e => setLiveDate(e.target.value)} />
              <button type="submit">Salvar no calendário + anunciar no feed</button>
            </form>
          </article>

          <article className="glass card">
            <h2>Próximas lives</h2>
            {filteredEvents.map(eventItem => (
              <div className="post" key={eventItem.id}>
                <strong>{eventItem.title}</strong>
                <p>{eventItem.description}</p>
                <small>{new Date(eventItem.scheduledAt).toLocaleString('pt-BR')}</small>
              </div>
            ))}
          </article>
        </section>
      )}

      {activeTab === 'songs' && (
        <section className="glass card">
          <h2>Songs (estilo Spotify)</h2>
          {filteredSongs.map(song => (
            <div className="song" key={song.title}>
              <span>{song.title}</span>
              <small>{song.duration}</small>
            </div>
          ))}
        </section>
      )}

      {activeTab === 'notifications' && (
        <section className="glass card">
          <h2>Notificações</h2>
          {userNotifications.map(note => (
            <div key={note.id} className={`note ${note.type}`}>
              <p>{note.message}</p>
              <small>{new Date(note.createdAt).toLocaleString('pt-BR')}</small>
            </div>
          ))}
        </section>
      )}

      {activeTab === 'profile' && (
        <section className="grid">
          <article className="glass card">
            <h2>Perfil</h2>
            <p><strong>Nick:</strong> @{currentUser.nickname}</p>
            <p><strong>Email:</strong> {currentUser.email}</p>
            <p><strong>Idade:</strong> {currentUser.age}</p>
            <button onClick={() => setCurrentUserId(null)}>Sair</button>
          </article>

          <article className="glass card">
            <h2>Chat entre perfis</h2>
            <select value={chatTarget} onChange={e => setChatTarget(e.target.value)}>
              <option value="">Selecionar perfil...</option>
              {state.users.filter(u => u.id !== currentUser.id).map(u => (
                <option key={u.id} value={u.id}>@{u.nickname}</option>
              ))}
            </select>
            <div className="chat-box">
              {(activeThread?.messages || []).map((m, i) => (
                <p key={`${m.sentAt}-${i}`}><strong>@{usersById[m.senderId]?.nickname}:</strong> {m.text}</p>
              ))}
            </div>
            <form className="stack-inline" onSubmit={sendChat}>
              <input placeholder="Mensagem" value={chatText} onChange={e => setChatText(e.target.value)} />
              <button type="submit">Enviar</button>
            </form>
          </article>
        </section>
      )}
    </main>
  );
};

export default App;
