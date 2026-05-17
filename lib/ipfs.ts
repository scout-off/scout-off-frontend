import axios from "axios";

const GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? "https://gateway.pinata.cloud/ipfs";

export async function uploadToIPFS(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);

  const { data } = await axios.post("/api/ipfs/upload", form);
  return data.cid as string;
}

export function ipfsUrl(cid: string) {
  return `${GATEWAY}/${cid}`;
}
