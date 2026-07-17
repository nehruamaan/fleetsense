"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { extractDocumentFields } from "@/lib/documents-llm";
import { maybeReconcile } from "@/lib/reconcile-load";

const VALID_TYPES = ["BOL", "POD", "RATE_CON", "ACCESSORIAL", "FUEL"] as const;
type DocType = (typeof VALID_TYPES)[number];

export async function submitDocument(formData: FormData) {
  const loadId = formData.get("loadId");
  const type = formData.get("type");
  const file = formData.get("file");

  if (typeof loadId !== "string" || !loadId) {
    throw new Error("A load must be selected.");
  }
  if (typeof type !== "string" || !VALID_TYPES.includes(type as DocType)) {
    throw new Error("A valid document type must be selected.");
  }
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("A file must be uploaded.");
  }

  const load = await prisma.load.findUnique({ where: { id: loadId } });
  if (!load) throw new Error("Load not found.");

  const assignment = await prisma.assignment.findFirst({
    where: { loadId },
    orderBy: { createdAt: "desc" },
  });
  const driverId = assignment ? assignment.driverId : (await prisma.driver.findFirstOrThrow()).id;

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const mimeType = file.type || "image/png";

  const document = await prisma.document.create({
    data: {
      loadId,
      driverId,
      type: type as DocType,
      imageUrl: `data:${mimeType};base64,${base64}`,
      status: "RECEIVED",
    },
  });

  const extraction = await extractDocumentFields(base64, mimeType, type);

  await prisma.document.update({
    where: { id: document.id },
    data: extraction
      ? {
          status: "EXTRACTED",
          extractedFields: JSON.stringify(extraction),
          confidencePerField: JSON.stringify(extraction.confidence),
        }
      : { status: "FAILED" },
  });

  await maybeReconcile(loadId);

  revalidatePath("/documents");
  revalidatePath(`/documents/${document.id}`);
}
