package org.exarhteam.iitc_mobile.car

import android.content.Context

/**
 * Daftar portal target ops (guid). Portal yang ada di daftar ini selalu ditampilkan di layar
 * mobil, apa pun jaraknya, dan ditandai "TARGET".
 *
 * Disimpan di SharedPreferences supaya nggak perlu izin storage dan tetap ada setelah app mati.
 * Sumber isinya di fase berikutnya: plugin IITC atau layar di HP.
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
