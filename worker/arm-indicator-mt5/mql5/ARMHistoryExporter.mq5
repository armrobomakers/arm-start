#property strict
#property script_show_inputs

#define EXPORT_VERSION "1.0.0"
#define EXPORT_DIR "ARMIndicator"
#define DEALS_FILE "ARMIndicator/history-deals.csv"
#define ORDERS_FILE "ARMIndicator/history-orders.csv"
#define MANIFEST_FILE "ARMIndicator/manifest.json"
#define DEALS_TMP "ARMIndicator/history-deals.csv.tmp"
#define ORDERS_TMP "ARMIndicator/history-orders.csv.tmp"
#define MANIFEST_TMP "ARMIndicator/manifest.json.tmp"

string MaskLogin(const long login)
  {
   string text=(string)login;
   int length=StringLen(text);
   if(length<4)
      return "***";
   return StringSubstr(text,0,2)+"***"+StringSubstr(text,length-2);
  }

string TimeValue(const long value)
  {
   if(value<=0)
      return "";
   return TimeToString((datetime)value,TIME_DATE|TIME_SECONDS);
  }

bool SecurityCheck()
  {
   if(TerminalInfoInteger(TERMINAL_CONNECTED)!=1)
     {
      Print("CRITICAL: terminal is not connected");
      return false;
     }
   if(AccountInfoInteger(ACCOUNT_TRADE_ALLOWED)!=0)
     {
      Print("CRITICAL: account trading is allowed");
      return false;
     }
   if(AccountInfoString(ACCOUNT_SERVER)!="Tickmill-Live")
     {
      PrintFormat("CRITICAL: unexpected server: %s",AccountInfoString(ACCOUNT_SERVER));
      return false;
     }
   return true;
  }

void RemoveTemporaryFiles()
  {
   FileDelete(DEALS_TMP,FILE_COMMON);
   FileDelete(ORDERS_TMP,FILE_COMMON);
   FileDelete(MANIFEST_TMP,FILE_COMMON);
  }

bool ReplaceTemporaryFiles()
  {
   if(!FileMove(DEALS_TMP,FILE_COMMON,DEALS_FILE,FILE_COMMON|FILE_REWRITE))
      return false;
   if(!FileMove(ORDERS_TMP,FILE_COMMON,ORDERS_FILE,FILE_COMMON|FILE_REWRITE))
      return false;
   if(!FileMove(MANIFEST_TMP,FILE_COMMON,MANIFEST_FILE,FILE_COMMON|FILE_REWRITE))
      return false;
   return true;
  }

int OnStart()
  {
   if(!SecurityCheck())
      return 1;

   FolderCreate(EXPORT_DIR,FILE_COMMON);
   RemoveTemporaryFiles();
   ResetLastError();
   datetime started=TimeLocal();
   if(!HistorySelect(0,TimeCurrent()))
     {
      PrintFormat("CRITICAL: HistorySelect failed, error=%d",GetLastError());
      return 2;
     }

   int deals_total=HistoryDealsTotal();
   int orders_total=HistoryOrdersTotal();
   int deals_file=FileOpen(DEALS_TMP,FILE_WRITE|FILE_CSV|FILE_ANSI|FILE_COMMON,';');
   int orders_file=FileOpen(ORDERS_TMP,FILE_WRITE|FILE_CSV|FILE_ANSI|FILE_COMMON,';');
   int manifest_file=FileOpen(MANIFEST_TMP,FILE_WRITE|FILE_TXT|FILE_ANSI|FILE_COMMON);
   if(deals_file==INVALID_HANDLE || orders_file==INVALID_HANDLE || manifest_file==INVALID_HANDLE)
     {
      PrintFormat("CRITICAL: output open failed, error=%d",GetLastError());
      if(deals_file!=INVALID_HANDLE) FileClose(deals_file);
      if(orders_file!=INVALID_HANDLE) FileClose(orders_file);
      if(manifest_file!=INVALID_HANDLE) FileClose(manifest_file);
      RemoveTemporaryFiles();
      return 3;
     }

   FileWrite(deals_file,"ticket","order","time","time_msc","type","type_name","entry","entry_name","magic","position_id","reason","reason_name","volume","price","commission","swap","profit","fee","symbol","comment","external_id");
   FileWrite(orders_file,"ticket","time_setup","time_setup_msc","time_done","time_done_msc","type","type_name","state","state_name","type_filling","filling_name","type_time","time_name","magic","position_id","position_by_id","volume_initial","volume_current","price_open","price_current","price_stoplimit","sl","tp","symbol","comment","external_id");

   long first_deal=0,last_deal=0,first_order=0,last_order=0;
   for(int i=0;i<deals_total;i++)
     {
      ulong ticket=HistoryDealGetTicket(i);
      if(ticket==0)
        {
         PrintFormat("CRITICAL: deal ticket read failed at index %d, error=%d",i,GetLastError());
         FileClose(deals_file); FileClose(orders_file); FileClose(manifest_file); RemoveTemporaryFiles(); return 4;
        }
      long deal_time=HistoryDealGetInteger(ticket,DEAL_TIME);
      long deal_type=HistoryDealGetInteger(ticket,DEAL_TYPE);
      long deal_entry=HistoryDealGetInteger(ticket,DEAL_ENTRY);
      long deal_reason=HistoryDealGetInteger(ticket,DEAL_REASON);
      if(first_deal==0 || deal_time<first_deal) first_deal=deal_time;
      if(deal_time>last_deal) last_deal=deal_time;
      FileWrite(deals_file,
                (long)ticket,
                HistoryDealGetInteger(ticket,DEAL_ORDER),
                TimeValue(deal_time),
                HistoryDealGetInteger(ticket,DEAL_TIME_MSC),
                deal_type,EnumToString((ENUM_DEAL_TYPE)deal_type),
                deal_entry,EnumToString((ENUM_DEAL_ENTRY)deal_entry),
                HistoryDealGetInteger(ticket,DEAL_MAGIC),
                HistoryDealGetInteger(ticket,DEAL_POSITION_ID),
                deal_reason,EnumToString((ENUM_DEAL_REASON)deal_reason),
                HistoryDealGetDouble(ticket,DEAL_VOLUME),
                HistoryDealGetDouble(ticket,DEAL_PRICE),
                HistoryDealGetDouble(ticket,DEAL_COMMISSION),
                HistoryDealGetDouble(ticket,DEAL_SWAP),
                HistoryDealGetDouble(ticket,DEAL_PROFIT),
                HistoryDealGetDouble(ticket,DEAL_FEE),
                HistoryDealGetString(ticket,DEAL_SYMBOL),
                HistoryDealGetString(ticket,DEAL_COMMENT),
                HistoryDealGetString(ticket,DEAL_EXTERNAL_ID));
      if((i+1)%500==0 || i+1==deals_total)
        {
         FileFlush(deals_file);
         PrintFormat("EXPORT DEALS %d/%d",i+1,deals_total);
        }
     }

   for(int i=0;i<orders_total;i++)
     {
      ulong ticket=HistoryOrderGetTicket(i);
      if(ticket==0)
        {
         PrintFormat("CRITICAL: order ticket read failed at index %d, error=%d",i,GetLastError());
         FileClose(deals_file); FileClose(orders_file); FileClose(manifest_file); RemoveTemporaryFiles(); return 5;
        }
      long order_setup=HistoryOrderGetInteger(ticket,ORDER_TIME_SETUP);
      long order_done=HistoryOrderGetInteger(ticket,ORDER_TIME_DONE);
      long order_type=HistoryOrderGetInteger(ticket,ORDER_TYPE);
      long order_state=HistoryOrderGetInteger(ticket,ORDER_STATE);
      long order_filling=HistoryOrderGetInteger(ticket,ORDER_TYPE_FILLING);
      long order_time_type=HistoryOrderGetInteger(ticket,ORDER_TYPE_TIME);
      if(first_order==0 || order_setup<first_order) first_order=order_setup;
      if(order_setup>last_order) last_order=order_setup;
      FileWrite(orders_file,
                (long)ticket,
                TimeValue(order_setup),
                HistoryOrderGetInteger(ticket,ORDER_TIME_SETUP_MSC),
                TimeValue(order_done),
                HistoryOrderGetInteger(ticket,ORDER_TIME_DONE_MSC),
                order_type,EnumToString((ENUM_ORDER_TYPE)order_type),
                order_state,EnumToString((ENUM_ORDER_STATE)order_state),
                order_filling,EnumToString((ENUM_ORDER_TYPE_FILLING)order_filling),
                order_time_type,EnumToString((ENUM_ORDER_TYPE_TIME)order_time_type),
                HistoryOrderGetInteger(ticket,ORDER_MAGIC),
                HistoryOrderGetInteger(ticket,ORDER_POSITION_ID),
                HistoryOrderGetInteger(ticket,ORDER_POSITION_BY_ID),
                HistoryOrderGetDouble(ticket,ORDER_VOLUME_INITIAL),
                HistoryOrderGetDouble(ticket,ORDER_VOLUME_CURRENT),
                HistoryOrderGetDouble(ticket,ORDER_PRICE_OPEN),
                HistoryOrderGetDouble(ticket,ORDER_PRICE_CURRENT),
                HistoryOrderGetDouble(ticket,ORDER_PRICE_STOPLIMIT),
                HistoryOrderGetDouble(ticket,ORDER_SL),
                HistoryOrderGetDouble(ticket,ORDER_TP),
                HistoryOrderGetString(ticket,ORDER_SYMBOL),
                HistoryOrderGetString(ticket,ORDER_COMMENT),
                HistoryOrderGetString(ticket,ORDER_EXTERNAL_ID));
      if((i+1)%500==0 || i+1==orders_total)
        {
         FileFlush(orders_file);
         PrintFormat("EXPORT ORDERS %d/%d",i+1,orders_total);
        }
     }

   string server=AccountInfoString(ACCOUNT_SERVER);
   FileWriteString(manifest_file,"{\n");
   FileWriteString(manifest_file,"  \"generated_at\": \""+TimeToString(TimeCurrent(),TIME_DATE|TIME_SECONDS)+"\",\n");
   FileWriteString(manifest_file,"  \"server\": \""+server+"\",\n");
   FileWriteString(manifest_file,"  \"masked_login\": \""+MaskLogin(AccountInfoInteger(ACCOUNT_LOGIN))+"\",\n");
   FileWriteString(manifest_file,"  \"trade_allowed\": false,\n");
   FileWriteString(manifest_file,"  \"deals_count\": "+IntegerToString(deals_total)+",\n");
   FileWriteString(manifest_file,"  \"orders_count\": "+IntegerToString(orders_total)+",\n");
   FileWriteString(manifest_file,"  \"first_deal_time\": \""+TimeValue(first_deal)+"\",\n");
   FileWriteString(manifest_file,"  \"last_deal_time\": \""+TimeValue(last_deal)+"\",\n");
   FileWriteString(manifest_file,"  \"first_order_time\": \""+TimeValue(first_order)+"\",\n");
   FileWriteString(manifest_file,"  \"last_order_time\": \""+TimeValue(last_order)+"\",\n");
   FileWriteString(manifest_file,"  \"export_version\": \""+EXPORT_VERSION+"\"\n");
   FileWriteString(manifest_file,"}\n");
   FileFlush(manifest_file);
   FileClose(deals_file);
   FileClose(orders_file);
   FileClose(manifest_file);
   if(!ReplaceTemporaryFiles())
     {
      PrintFormat("CRITICAL: atomic replacement failed, error=%d",GetLastError());
      RemoveTemporaryFiles();
      return 6;
     }
   PrintFormat("SCRIPT FINISHED deals=%d orders=%d elapsed_seconds=%d first_deal=%s last_deal=%s first_order=%s last_order=%s",deals_total,orders_total,(int)(TimeLocal()-started),TimeValue(first_deal),TimeValue(last_deal),TimeValue(first_order),TimeValue(last_order));
   return 0;
  }
