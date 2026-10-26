import Link from "next/link";

export default function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Calé, accueil">
      <span className="brand-dot" aria-hidden>
        ✓
      </span>
      Calé
    </Link>
  );
}
