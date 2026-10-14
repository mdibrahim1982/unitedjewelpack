import { useLanguage, translateFolderName } from "../i18n";
import { usePhotoStore } from "../photoStore";

export default function FolderGrid({ onOpenFolder }) {
  const { t, lang } = useLanguage();
  const { publicFolders } = usePhotoStore();

  return (
    <section className="wrap page-section">
      <h1 className="page-title serif">{t("homeTitle")}</h1>
      <p className="page-sub">{t("homeSubtitle")}</p>

      <div className="folder-grid">
        {publicFolders.map((folder) => (
          <button
            key={folder.id}
            className="folder-tile"
            onClick={() => onOpenFolder(folder.slug)}
          >
            <div className="folder-cover">
              <img src={folder.cover} alt={folder.name} loading="lazy" />
            </div>
            <div className="folder-info">
              <span className="folder-icon" aria-hidden="true">
                📁
              </span>
              <div>
                <div className="folder-name serif">
                  {translateFolderName(lang, folder.slug, folder.name)}
                </div>
                <div className="folder-count">
                  {t.count("photoCount", folder.photos.length)}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
