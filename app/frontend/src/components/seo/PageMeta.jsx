import { Helmet } from "react-helmet-async";

export default function PageMeta({ title, description, image, path = "" }) {
  const origin = import.meta.env.VITE_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "");
  const url = `${origin}${path}`;
  const imageUrl = image
    ? image.startsWith("http")
      ? image
      : `${origin}${image.startsWith("/") ? image : `/${image}`}`
    : `${origin}/logo.jpg`;

  return (
    <Helmet>
      <title>{title}</title>
      {description && <meta name="description" content={description} />}
      <link rel="canonical" href={url} />
      <meta property="og:title" content={title} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:url" content={url} />
      <meta property="og:image" content={imageUrl} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content={imageUrl} />
    </Helmet>
  );
}
