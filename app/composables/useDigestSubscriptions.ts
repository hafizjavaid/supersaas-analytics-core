import type { DigestSubscription } from "#layers/core/shared/types/digests";
import type { DigestSetting } from "#layers/core/shared/utils/digests";

export const digestSettingItems = DIGEST_SETTINGS.map(setting => ({ label: DIGEST_SETTING_LABELS[setting], value: setting }));

export async function useDigestSubscriptions() {
	const { organization } = useOrganization();
	const notify = useNotify();
	const path = computed(() => `/api/organizations/${organization.value.id}/digest-subscriptions`);
	const { data: subscriptions, refresh } = await useFetch<DigestSubscription[]>(path, {
		key: computed(() => `digest-subscriptions:${organization.value.id}`),
		default: () => [],
	});

	function settingOf(siteId: string): DigestSetting {
		return subscriptions.value.find(subscription => subscription.siteId === siteId)?.frequency ?? "off";
	}

	async function choose(siteId: string, frequency: DigestSetting) {
		try {
			await $fetch(`${path.value}/${siteId}`, { method: "PUT", body: { frequency } });
			notify.success(frequency === "off" ? "Digest turned off" : `${DIGEST_SETTING_LABELS[frequency]} Digest on`);
		}
		catch (caught) {
			notify.error("Could not save the Digest setting", caught);
		}
		await refresh();
	}

	return { subscriptions, settingOf, choose };
}
