import Brand from "@/components/Brand";
import CreateForm from "@/components/CreateForm";

export default function Home() {
  return (
    <main className="wrap">
      <Brand />
      <section className="hero">
        <h1>On se voit quand&nbsp;?</h1>
        <p>Propose quelques dates, envoie le lien, chacun coche ses dispos. La meilleure date ressort toute seule.</p>
      </section>
      <CreateForm />
    </main>
  );
}
