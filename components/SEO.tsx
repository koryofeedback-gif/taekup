
import React from 'react';
import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  noindex?: boolean;
}

export const SEO: React.FC<SEOProps> = ({ 
  title = "TaekUp - Every Step Takes You Up", 
  description = "The ultimate management platform for Martial Arts schools. Gamified tracking, AI assistants, and a revenue engine that pays you.", 
  image = "https://taekup.com/og-image.jpg",
  url = "https://taekup.com",
  noindex = false
}) => {
  const siteTitle = title.includes("TaekUp") ? title : `${title} | TaekUp`;

  return (
    <Helmet>
      {/* Standard Metadata */}
      <title>{siteTitle}</title>
      <meta name="description" content={description} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      <link rel="canonical" href={url} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content="website" />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={siteTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />

      {/* Twitter */}
      <meta property="twitter:card" content="summary_large_image" />
      <meta property="twitter:url" content={url} />
      <meta property="twitter:title" content={siteTitle} />
      <meta property="twitter:description" content={description} />
      <meta property="twitter:image" content={image} />
    </Helmet>
  );
};
