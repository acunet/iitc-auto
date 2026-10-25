package org.exarhteam.iitc_mobile.car

import android.content.Context

/**
 * List of ops target portals (guid). A portal in this list is always shown on the car screen,
 * whatever its distance, and is flagged "TARGET".
 *
 * Stored in SharedPreferences so no storage permission is needed and the list still exists after
 * the app is killed. Where the entries come from is a later phase: an IITC plugin or a phone-side screen.
 */
class OpsTargetStore(context: Context) {

    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun targets(): Set<String> = prefs.getStringSet(KEY_TARGETS, emptySet()) ?: emptySet()

    fun setTargets(guids: Collection<String>) {
        prefs.edit().putStringSet(KEY_TARGETS, guids.filter { it.isNotBlank() }.toSet()).apply()
    }

    fun toggle(guid: String): Boolean {
        val current = targets().toMutableSet()
        val added = if (current.contains(guid)) {
            current.remove(guid); false
        } else {
            current.add(guid); true
        }
        setTargets(current)
        return added
    }

    fun clear() = setTargets(emptySet())

    companion object {
        private const val PREFS_NAME = "iitc_auto_targets"
        private const val KEY_TARGETS = "target_guids"
    }
}
