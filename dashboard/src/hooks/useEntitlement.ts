import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Entitlement } from "@/lib/entitlements";

export function useEntitlement(propertyId: string | undefined) {
  return useQuery<Entitlement | null>({
    queryKey: ["entitlement", propertyId],
    queryFn: () =>
      api.get(`/api/properties/${propertyId}/entitlement`)
        .then(r => r.data)
        .catch(() => null),
    enabled: !!propertyId,
    staleTime: 30_000,
  });
}

export function useUpsertEntitlement(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Entitlement>) =>
      api.post(`/api/properties/${propertyId}/entitlement`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["entitlement", propertyId] }),
  });
}
