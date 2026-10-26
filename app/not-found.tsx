import Brand from "@/components/Brand";

export default function NotFound() {
  return (
    <main className="wrap">
      <Brand />
      <section className="hero">
        <h1>Oups, introuvable</h1>
        <p>Ce sondage n&apos;existe pas ou a expiré. Vérifie le lien, ou crée-en un nouveau.</p>
      </section>
      <a href="/" className="btn btn-primary btn-block">
        Créer un sondage
      </a>
    </main>
  );
}
