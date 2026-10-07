import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const DIGITAL_ASSETS_BUCKET = "digital-assets";

export interface DigitalFolder {
  id: string;
  name: string;
  parent_folder_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface DigitalAsset {
  id: string;
  folder_id: string | null;
  name: string;
  file_path: string;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
}

const FOLDERS_KEY = ["digital_asset_folders"];
const ASSETS_KEY = ["digital_assets"];

export function useAllFolders() {
  return useQuery({
    queryKey: FOLDERS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("digital_asset_folders").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as DigitalFolder[];
    },
    staleTime: 30_000,
  });
}

export function useAllAssets() {
  return useQuery({
    queryKey: ASSETS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("digital_assets").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as DigitalAsset[];
    },
    staleTime: 30_000,
  });
}

export function useCreateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, parentFolderId, userId }: { name: string; parentFolderId: string | null; userId: string }) => {
      const { data, error } = await supabase.from("digital_asset_folders").insert({
        name: name.trim(),
        parent_folder_id: parentFolderId,
        created_by: userId,
      }).select().single();
      if (error) throw error;
      return data as DigitalFolder;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FOLDERS_KEY }),
  });
}

export function useRenameFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("digital_asset_folders").update({ name: name.trim() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FOLDERS_KEY }),
  });
}

export function useMoveFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, parentFolderId }: { id: string; parentFolderId: string | null }) => {
      const { error } = await supabase.from("digital_asset_folders").update({ parent_folder_id: parentFolderId }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FOLDERS_KEY }),
  });
}

export function useDeleteFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Cascade: sub-folders cascade at the DB level; their assets need
      // their storage objects removed first, so collect the whole subtree.
      const { data: allFolders, error: fErr } = await supabase.from("digital_asset_folders").select("id, parent_folder_id");
      if (fErr) throw fErr;
      const subtree = new Set<string>([id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const f of (allFolders ?? [])) {
          if (f.parent_folder_id && subtree.has(f.parent_folder_id) && !subtree.has(f.id)) {
            subtree.add(f.id);
            grew = true;
          }
        }
      }
      const { data: assetsToRemove, error: aErr } = await supabase
        .from("digital_assets")
        .select("file_path")
        .in("folder_id", Array.from(subtree));
      if (aErr) throw aErr;
      const paths = (assetsToRemove ?? []).map((a) => a.file_path);
      if (paths.length) await supabase.storage.from(DIGITAL_ASSETS_BUCKET).remove(paths);
      const { error } = await supabase.from("digital_asset_folders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FOLDERS_KEY });
      qc.invalidateQueries({ queryKey: ASSETS_KEY });
    },
  });
}

export function useRenameAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("digital_assets").update({ name: name.trim() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSETS_KEY }),
  });
}

export function useMoveAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, folderId }: { id: string; folderId: string | null }) => {
      const { error } = await supabase.from("digital_assets").update({ folder_id: folderId }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSETS_KEY }),
  });
}

export function useDeleteAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (asset: Pick<DigitalAsset, "id" | "file_path">) => {
      await supabase.storage.from(DIGITAL_ASSETS_BUCKET).remove([asset.file_path]);
      const { error } = await supabase.from("digital_assets").delete().eq("id", asset.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSETS_KEY }),
  });
}

const STARS_KEY = ["digital_asset_stars"];

export interface StarredItem { item_type: "folder" | "asset"; item_id: string }

export function useStarredItems() {
  return useQuery({
    queryKey: STARS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("digital_asset_stars").select("item_type, item_id");
      if (error) throw error;
      return (data ?? []) as StarredItem[];
    },
    staleTime: 30_000,
  });
}

export function useToggleStar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemType, itemId, userId, starred }: { itemType: "folder" | "asset"; itemId: string; userId: string; starred: boolean }) => {
      if (starred) {
        const { error } = await supabase.from("digital_asset_stars").delete()
          .eq("user_id", userId).eq("item_type", itemType).eq("item_id", itemId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("digital_asset_stars").insert({ user_id: userId, item_type: itemType, item_id: itemId });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: STARS_KEY }),
  });
}

export function useCreateAssetRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (asset: {
      name: string; folderId: string | null; filePath: string;
      contentType: string; sizeBytes: number; userId: string;
    }) => {
      const { error } = await supabase.from("digital_assets").insert({
        name: asset.name,
        folder_id: asset.folderId,
        file_path: asset.filePath,
        content_type: asset.contentType,
        size_bytes: asset.sizeBytes,
        uploaded_by: asset.userId,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSETS_KEY }),
  });
}
