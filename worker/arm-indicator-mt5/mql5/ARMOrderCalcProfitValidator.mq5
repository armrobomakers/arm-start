#property strict
#property script_show_inputs

#define REQUESTS "ARMIndicator/ordercalc-requests.csv"
#define TMP "ARMIndicator/ordercalc-results.csv.tmp"
#define OUT "ARMIndicator/ordercalc-results.csv"

bool Secure()
  {
   if(TerminalInfoInteger(TERMINAL_CONNECTED)!=1 || AccountInfoInteger(ACCOUNT_TRADE_ALLOWED)!=0 || AccountInfoString(ACCOUNT_SERVER)!="Tickmill-Live")
     { Print("CRITICAL: OrderCalcProfit validator security check failed"); return false; }
   return true;
  }

int OnStart()
  {
   if(!Secure()) return 1;
   int input_file=FileOpen(REQUESTS,FILE_READ|FILE_CSV|FILE_ANSI|FILE_COMMON,';');
   if(input_file==INVALID_HANDLE) { PrintFormat("CRITICAL: request file open failed, error=%d",GetLastError()); return 2; }
   FolderCreate("ARMIndicator",FILE_COMMON); FileDelete(TMP,FILE_COMMON);
   int output=FileOpen(TMP,FILE_WRITE|FILE_CSV|FILE_ANSI|FILE_COMMON,';');
   if(output==INVALID_HANDLE) { FileClose(input_file); return 3; }
   FileReadString(input_file); FileReadString(input_file); FileReadString(input_file); FileReadString(input_file); FileReadString(input_file); FileReadString(input_file); FileReadString(input_file);
   FileWrite(output,"position_id","symbol","direction","volume","open_price","close_price","realized_profit","calculated_profit","abs_error","relative_error","status");
   int processed=0,failed=0;
   while(!FileIsEnding(input_file))
     {
      string position_id=FileReadString(input_file);
      string symbol=FileReadString(input_file);
      string direction=FileReadString(input_file);
      string volume_text=FileReadString(input_file);
      string open_text=FileReadString(input_file);
      string close_text=FileReadString(input_file);
      string realized_text=FileReadString(input_file);
      if(position_id=="" || symbol=="") continue;
      double volume=StringToDouble(volume_text),open_price=StringToDouble(open_text),close_price=StringToDouble(close_text),realized=StringToDouble(realized_text),calculated=0;
      ENUM_ORDER_TYPE order_type=(ENUM_ORDER_TYPE)(direction=="BUY" ? 0 : 1);
      bool ok=OrderCalcProfit(order_type,symbol,volume,open_price,close_price,calculated);
      if(!ok) { failed++; FileWrite(output,position_id,symbol,direction,volume,open_price,close_price,realized,"","","","calc_failed"); }
      else
        {
         double absolute=MathAbs(calculated-realized);
         double relative=(MathAbs(realized)>0 ? absolute/MathAbs(realized) : absolute);
         FileWrite(output,position_id,symbol,direction,volume,open_price,close_price,realized,calculated,absolute,relative,"ok");
        }
      processed++;
      if(processed%100==0) PrintFormat("VALIDATE ORDERCALCPROFIT %d",processed);
     }
   FileFlush(output); FileClose(input_file); FileClose(output);
   if(!FileMove(TMP,FILE_COMMON,OUT,FILE_COMMON|FILE_REWRITE)) { PrintFormat("CRITICAL: replacement failed, error=%d",GetLastError()); FileDelete(TMP,FILE_COMMON); return 4; }
   PrintFormat("ORDERCALCPROFIT FINISHED samples=%d failed=%d",processed,failed);
   return 0;
  }
