import * as React from "react";

const NextImage = ({ src, alt, fill, unoptimized, ...props }: { src: string; alt: string; fill?: boolean; unoptimized?: boolean; [key: string]: unknown }) => {
  return <img src={src} alt={alt ?? ""} {...props} />;
};

export default NextImage;
