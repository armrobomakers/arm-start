#property strict
#property script_show_inputs

#define REQUESTS "ARMIndicator/validation-conversion-price-requests.csv"
#define TMP "ARMIndicator/validation-conversion-historical-prices.csv.tmp"
#define OUT "ARMIndicator/validation-conversion-historical-prices.csv"

bool Secure()
  {
   if(TerminalInfoInteger(TERMINAL_CONNECTED)!=1 || AccountInfoInteger(ACCOUNT_TRADE_ALLOWED)!=0 || AccountInfoString(ACCOUNT_SERVER)!="Tickmill-Live")
     { Print("CRITICAL: validation conversion price exporter security check failed"); return false; }
   return true;
  }

void WriteResult(const int file,const string sample_id,const string conversion_symbol,const string requested,const string actual,const string bid,const string ask,const long gap,const string source,const string status,const string direction,const string source_symbol,const string profit_currency,const string account_currency)
  { FileWrite(file,sample_id,conversion_symbol,requested,actual,bid,ask,gap,source,status,direction,source_symbol,profit_currency,account_currency); }

int OnStart()
  {
   if(!Secure()) return 1;
   int input_file=FileOpen(REQUESTS,FILE_READ|FILE_CSV|FILE_ANSI|FILE_COMMON,';');
   if(input_file==INVALID_HANDLE) { PrintFormat("CRITICAL: validation conversion request file open failed, error=%d",GetLastError()); return 2; }
   FolderCreate("ARMIndicator",FILE_COMMON); FileDelete(TMP,FILE_COMMON);
   int output=FileOpen(TMP,FILE_WRITE|FILE_CSV|FILE_ANSI|FILE_COMMON,';');
   if(output==INVALID_HANDLE) { FileClose(input_file); return 3; }
   for(int i=0;i<7;i++) FileReadString(input_file);
   FileWrite(output,"sample_id","conversion_symbol","requested_server_time","actual_tick_time","bid","ask","gap_seconds","source","status","direction","source_symbol","profit_currency","account_currency");
   int processed=0,found=0,previous_session_ticks=0,m1_fallback=0,missing=0;
   long max_tick_gap_seconds=0;
   int lookback_seconds[7]={15*60,2*60*60,12*60*60,36*60*60,72*60*60,120*60*60,168*60*60};
   while(!FileIsEnding(input_file))
     {
      string sample_id=FileReadString(input_file),conversion_symbol=FileReadString(input_file),requested=FileReadString(input_file),direction=FileReadString(input_file),source_symbol=FileReadString(input_file),profit_currency=FileReadString(input_file),account_currency=FileReadString(input_file);
      if(sample_id=="" || conversion_symbol=="" || requested=="") continue;
      datetime requested_time=StringToTime(requested);
      ulong requested_msc=(ulong)requested_time*1000;
      MqlTick selected_tick;
      ZeroMemory(selected_tick);
      bool selected=false;
      for(int window=0;window<7 && !selected;window++)
        {
         MqlTick ticks[];
         ulong seconds=(ulong)lookback_seconds[window];
         ulong from_msc=requested_msc>seconds*1000 ? requested_msc-seconds*1000 : 0;
         int tick_count=CopyTicksRange(conversion_symbol,ticks,COPY_TICKS_ALL,from_msc,requested_msc);
         for(int i=0;i<tick_count;i++)
           if((ulong)ticks[i].time_msc<=requested_msc && (ticks[i].bid>0 || ticks[i].ask>0) && (!selected || ticks[i].time_msc>selected_tick.time_msc)) { selected_tick=ticks[i]; selected=true; }
        }
      if(selected)
        {
         long actual=selected_tick.time_msc/1000,gap=(long)requested_time-actual;
         WriteResult(output,sample_id,conversion_symbol,requested,TimeToString((datetime)actual,TIME_DATE|TIME_SECONDS),DoubleToString(selected_tick.bid,8),DoubleToString(selected_tick.ask,8),gap,"tick","ok",direction,source_symbol,profit_currency,account_currency);
         found++; if(gap>600) previous_session_ticks++; if(gap>max_tick_gap_seconds) max_tick_gap_seconds=gap;
        }
      else
        {
         MqlRates rates[];
         datetime from=requested_time>7*24*60*60 ? requested_time-7*24*60*60 : 0;
         int rate_count=CopyRates(conversion_symbol,PERIOD_M1,from,requested_time+60,rates),rate_index=-1;
         for(int i=0;i<rate_count;i++) if(rates[i].time<=requested_time) rate_index=i;
         if(rate_index>=0) { long gap=(long)requested_time-(long)rates[rate_index].time; WriteResult(output,sample_id,conversion_symbol,requested,TimeToString(rates[rate_index].time,TIME_DATE|TIME_SECONDS),"","",gap,"m1_fallback","approximate",direction,source_symbol,profit_currency,account_currency); m1_fallback++; }
         else { WriteResult(output,sample_id,conversion_symbol,requested,"","","",0,"","missing",direction,source_symbol,profit_currency,account_currency); missing++; }
        }
      processed++; if(processed%100==0) PrintFormat("EXPORT VALIDATION CONVERSION PRICES %d",processed);
     }
   FileFlush(output); FileClose(input_file); FileClose(output);
   if(!FileMove(TMP,FILE_COMMON,OUT,FILE_COMMON|FILE_REWRITE)) { PrintFormat("CRITICAL: validation conversion output replacement failed, error=%d",GetLastError()); FileDelete(TMP,FILE_COMMON); return 4; }
   PrintFormat("VALIDATION CONVERSION EXPORT FINISHED requests=%d ticks=%d previous_session_ticks=%d m1_fallbacks=%d missing=%d max_tick_gap_seconds=%d",processed,found,previous_session_ticks,m1_fallback,missing,max_tick_gap_seconds);
   return 0;
  }
