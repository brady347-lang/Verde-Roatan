import React from 'react';
import { ArrowUpRight, BadgeCheck, Leaf, Megaphone, Sprout, Users } from 'lucide-react';
import { Language } from '../types';

interface CommunityHomeScreenProps {
  lang: Language;
  displayName: string;
  isSignedIn: boolean;
  onOpenMyRootWise: () => void;
  onNavigate: (tab: any) => void;
}

const ADMIN_FEATURES = [
  {
    category: 'GARDEN INSPIRATION',
    categoryEs: 'INSPIRACIÓN PARA EL JARDÍN',
    title: 'Bring more life to your outdoor space',
    titleEs: 'Dale más vida a tu espacio exterior',
    description: 'Ideas and practical inspiration from the RootWise team.',
    descriptionEs: 'Ideas e inspiración práctica del equipo RootWise.',
    image: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=1100&q=85',
    imageAlt: 'Lush green garden with a variety of plants'
  },
  {
    category: 'LANDSCAPE SPOTLIGHT',
    categoryEs: 'PROYECTO DESTACADO',
    title: 'Thoughtful planting makes a space feel complete',
    titleEs: 'Una buena selección de plantas transforma cualquier espacio',
    description: 'A project feature format for approved landscaper updates.',
    descriptionEs: 'Formato para destacar proyectos aprobados de paisajistas.',
    image: 'https://images.unsplash.com/photo-1558521958-0a228e77e984?auto=format&fit=crop&w=1100&q=85',
    imageAlt: 'Tropical landscaped garden'
  },
  {
    category: 'GROWING NOTES',
    categoryEs: 'CONSEJOS DE CULTIVO',
    title: 'Small, consistent care builds healthier gardens',
    titleEs: 'El cuidado constante ayuda a tener jardines más sanos',
    description: 'A place for admin-published seasonal guidance and announcements.',
    descriptionEs: 'Espacio para consejos de temporada y anuncios publicados por administración.',
    image: 'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?auto=format&fit=crop&w=1100&q=85',
    imageAlt: 'Sunlit rows of healthy garden plants'
  }
];

export const CommunityHomeScreen: React.FC<CommunityHomeScreenProps> = ({
  lang, displayName, isSignedIn, onOpenMyRootWise, onNavigate
}) => {
  const es = lang === 'es';

  return (
    <main className="flex flex-col gap-5 pb-7">
      <header className="px-1 pt-1">
        <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[.18em] text-[var(--palm)]">
          <Users className="h-3.5 w-3.5" /> ROOTWISE COMMUNITY
        </p>
        <h1 className="mt-1 text-[27px] font-extrabold leading-tight text-[var(--ink)]">
          {es ? 'Ideas que hacen crecer' : 'A community that grows'}
        </h1>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          {isSignedIn
            ? (es ? `Qué bueno verte${displayName ? `, ${displayName.split(' ')[0]}` : ''}. Descubre proyectos, ideas y novedades.` : `Good to see you${displayName ? `, ${displayName.split(' ')[0]}` : ''}. Discover projects, ideas and updates.`)
            : (es ? 'Descubre proyectos, ideas y novedades de nuestra comunidad verde.' : 'Discover projects, ideas and updates from our green community.')}
        </p>
      </header>

      <button type="button" onClick={onOpenMyRootWise}
        className="group flex items-center gap-3 rounded-3xl bg-[#0c3d2c] p-4 text-left text-white shadow-md transition-transform active:scale-[.99]">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10">
          <img src="/rootwise-mark.svg" alt="" className="h-9 w-9 rounded-lg object-cover" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-extrabold tracking-[.16em] text-emerald-200">{es ? 'TU ESPACIO PRIVADO' : 'YOUR PRIVATE SPACE'}</span>
          <span className="mt-0.5 block text-lg font-extrabold">My RootWise</span>
          <span className="block text-xs text-white/70">{es ? 'Tu historial, observaciones y guía personal' : 'Your garden history, observations and personal guidance'}</span>
        </span>
        <ArrowUpRight className="h-5 w-5 shrink-0 text-emerald-200 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </button>

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3.5">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-[var(--palm)]" />
          <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[var(--palm)]">{es ? 'ANUNCIOS DE ROOTWISE' : 'ROOTWISE ANNOUNCEMENTS'}</p>
        </div>
        <p className="mt-1 text-sm font-bold text-[var(--ink)]">{es ? 'Novedades oficiales y promociones aprobadas aparecerán aquí.' : 'Official updates and approved promotions will appear here.'}</p>
        <p className="mt-1 text-xs text-[var(--ink-soft)]">{es ? 'Solo el contenido aprobado por administración se mostrará como anuncio oficial.' : 'Only content approved by an administrator will appear as an official announcement.'}</p>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-end justify-between px-1">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[.17em] text-[var(--palm)]">{es ? 'DESTACADOS' : 'FEATURED'}</p>
            <h2 className="text-xl font-extrabold text-[var(--ink)]">{es ? 'De nuestra comunidad' : 'From our community'}</h2>
          </div>
          <span className="text-[10px] text-[var(--ink-soft)]">{es ? 'Vista de ejemplo' : 'Layout preview'}</span>
        </div>

        {ADMIN_FEATURES.map((feature) => (
          <article key={feature.category} className="overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] shadow-sm">
            <div className="relative h-48 bg-[var(--surface-2)]">
              <img src={feature.image} alt={feature.imageAlt} loading="lazy" className="h-full w-full object-cover" />
              <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-[#082f23]/90 px-2.5 py-1.5 text-[9px] font-extrabold tracking-wider text-white">
                <BadgeCheck className="h-3.5 w-3.5 text-emerald-300" /> {es ? 'PUBLICADO POR ADMIN · EJEMPLO' : 'ADMIN PUBLISHED · SAMPLE'}
              </span>
            </div>
            <div className="p-4">
              <p className="text-[9px] font-extrabold tracking-[.16em] text-[var(--palm)]">{es ? feature.categoryEs : feature.category}</p>
              <h3 className="mt-1 text-base font-extrabold leading-snug text-[var(--ink)]">{es ? feature.titleEs : feature.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-soft)]">{es ? feature.descriptionEs : feature.description}</p>
              <div className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-[var(--ink-soft)]">
                <Leaf className="h-3.5 w-3.5 text-[var(--palm)]" />
                {es ? 'Contenido de demostración · no es una publicación real' : 'Demonstration content · not a live post'}
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-2xl bg-[var(--surface-2)] p-4">
        <div className="flex items-center gap-2"><Sprout className="h-5 w-5 text-[var(--palm)]"/><h2 className="text-sm font-extrabold">{es ? 'Comparte lo que estás cultivando' : 'Share what you are growing'}</h2></div>
        <p className="mt-1 text-xs leading-relaxed text-[var(--ink-soft)]">{es ? 'La publicación de proyectos, fotos, comentarios y promociones se habilitará cuando el sistema comunitario esté conectado.' : 'Project posts, photos, comments and promotions will be enabled once the community system is connected.'}</p>
        <button type="button" onClick={() => onNavigate('explore')} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[var(--palm)] px-3.5 py-2.5 text-xs font-bold text-white">
          {es ? 'Explorar paisajistas y viveros' : 'Explore landscapers and nurseries'} <ArrowUpRight className="h-4 w-4"/>
        </button>
      </section>
    </main>
  );
};
