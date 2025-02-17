import React, { FC, useEffect, useRef, useState } from "react";
import PageContainer from "@/components/PageContainer";
import { useMemoizedFn, useMount, usePagination } from "ahooks";
import useElectron from "@/hooks/useElectron";
import { DownloadFilter } from "@/types";
import { useTranslation } from "react-i18next";
import { DownloadList } from "./components";
import DownloadForm, {
  DownloadFormRef,
  DownloadFormType,
} from "@/components/DownloadForm";
import { FolderIcon, ExtractIcon } from "@/assets/svg";
import { Button } from "@/components/ui/button";
import { Popover, QRCode } from "antd";
import { QrcodeOutlined } from "@ant-design/icons";
import { HomeDownloadButton } from "@/components/HomeDownloadButton";
import { downloadFormSelector, useConfigStore } from "@/store/config";
import { useShallow } from "zustand/react/shallow";
import {
  isDownloadType,
  isWeb,
  randomName,
  tdApp,
  urlDownloadType,
} from "@/utils";
import { CLICK_DOWNLOAD } from "@/const";
import { useLocation } from "react-router-dom";
import { useAppStore, appStoreSelector } from "@/store/app";

interface Props {
  filter?: DownloadFilter;
}

const HomePage: FC<Props> = ({ filter = DownloadFilter.list }) => {
  const {
    getDownloadItems,
    openDir,
    showBrowserWindow,
    addDownloadItem,
    addDownloadItems,
    downloadItemsNow,
    downloadNow,
    getLocalIP,
  } = useElectron();
  const appStore = useAppStore(useShallow(appStoreSelector));
  const { t } = useTranslation();
  const [localIP, setLocalIP] = useState<string>("");
  const newFormRef = useRef<DownloadFormRef>(null);
  const { lastIsBatch, lastDownloadTypes } = useConfigStore(
    useShallow(downloadFormSelector),
  );
  const location = useLocation();
  const {
    data = { total: 0, list: [] },
    loading,
    pagination,
    refresh,
  } = usePagination(
    ({ current, pageSize }) => {
      return getDownloadItems({
        current,
        pageSize,
        filter,
      });
    },
    {
      defaultPageSize: 50,
      refreshDeps: [filter],
    },
  );

  useEffect(() => {
    const search = new URLSearchParams(location.search);

    // new
    if (search.has("n")) {
      const typeParam = search.get("type");
      const silent = !!search.get("silent");
      const urlDecode = decodeURIComponent(search.get("encodedURL") || "");
      const url = urlDecode || search.get("url") || "";
      const name = search.get("name") + randomName() || randomName();
      const type = isDownloadType(typeParam) ? typeParam : urlDownloadType(url);
      const headers = decodeURIComponent(search.get("headers") || "");

      if (silent) {
        const item: Omit<DownloadItem, "id"> = {
          type,
          url,
          name,
          headers,
        };
        downloadNow(item);
      } else {
        const item: DownloadFormType = {
          batch: false,
          type,
          url,
          name,
          headers,
        };
        newFormRef.current?.openModal(item);
      }
    }
  }, [location.search]);

  // mac ipc event get url params in macos schceme
  useEffect(() => {
    const handleUrlEvent = (url: string) => {
      const searchParams = new URLSearchParams(url.split("?")[1]);
      if (searchParams.get("n") === "true") {
        const name = searchParams.get("name") || randomName();
        const urlParam = searchParams.get("url") || "";
        const item: DownloadFormType = {
          batch: false,
          type: urlDownloadType(urlParam),
          url: urlParam,
          name,
          headers: "",
        };
        newFormRef.current?.openModal(item);
      }
    };

    window.electron.onUrlParams(handleUrlEvent);

    return () => {
      window.electron.onUrlParams(handleUrlEvent);
    };
  }, []);

  useMount(async () => {
    const ip = await getLocalIP();
    setLocalIP(ip);
  });

  // 首先添加一个获取页面标题的辅助函数
  const getPageTitle = async (url: string): Promise<string> => {
    try {
      const { data } = await window.electron.getPageTitle(url);
      return data.data;
    } catch (error) {
      console.error("Failed to fetch page title:", error);
      return "";
    }
  };

  // 修改后的 confirmAddItems 函数
  const confirmAddItems = useMemoizedFn(
    async (values: DownloadFormType, now?: boolean) => {
      const {
        batch,
        batchList = "",
        name = "",
        headers,
        type,
        url,
        folder,
      } = values;

      if (batch) {
        const items: Omit<DownloadItem, "id">[] = await Promise.all(
          batchList.split("\n").map(async (line: string) => {
            const [url, customName, folder] = line.trim().split(" ");
            const pageTitle = await getPageTitle(url.trim());
            return {
              url: url.trim(),
              name: customName?.trim() || pageTitle || randomName(),
              headers,
              type,
              folder,
            };
          }),
        );

        if (now) {
          await downloadItemsNow(items);
        } else {
          await addDownloadItems(items);
        }
      } else {
        const pageTitle = await getPageTitle(url);
        const item: Omit<DownloadItem, "id"> = {
          name: name || pageTitle || randomName(),
          url,
          headers,
          type,
          folder,
        };
        if (now) {
          await downloadNow(item);
        } else {
          await addDownloadItem(item);
        }
      }

      refresh();
      return true;
    },
  );

  const handleOpenForm = useMemoizedFn(() => {
    tdApp.onEvent(CLICK_DOWNLOAD);
    const item: DownloadFormType = {
      batch: lastIsBatch,
      type: lastDownloadTypes,
    };
    newFormRef.current?.openModal(item);
  });

  return (
    <PageContainer
      title={
        filter === DownloadFilter.list
          ? t("downloadList")
          : t("downloadComplete")
      }
      rightExtra={
        <div className="flex flex-row gap-2">
          {filter === DownloadFilter.list && appStore.openInNewWindow && (
            <Button onClick={() => showBrowserWindow()}>
              <ExtractIcon fill="#fff" />
              {t("materialExtraction")}
            </Button>
          )}
          {filter === DownloadFilter.done && !isWeb && (
            <Popover
              content={
                <div>
                  <QRCode value={localIP ? `http://${localIP}:3222/` : ""} />
                  <div className="text-xs">{t("scanToWatch")}</div>
                </div>
              }
            >
              <Button>
                <QrcodeOutlined />
                {t("playOnMobile")}
              </Button>
            </Popover>
          )}
          {!isWeb && (
            <Button onClick={() => openDir(appStore.local)}>
              <FolderIcon />
              {t("openFolder")}
            </Button>
          )}
          {filter === DownloadFilter.list && (
            <HomeDownloadButton onClick={handleOpenForm} />
          )}
        </div>
      }
      className="rounded-lg bg-white p-3 dark:bg-[#1F2024]"
    >
      <DownloadList
        loading={loading}
        data={data.list}
        filter={filter}
        refresh={refresh}
        pagination={pagination}
      />

      <DownloadForm
        id="home"
        ref={newFormRef}
        destroyOnClose
        onAddToList={(values) => confirmAddItems(values)}
        onDownloadNow={(values) => confirmAddItems(values, true)}
      />
    </PageContainer>
  );
};

export default HomePage;
